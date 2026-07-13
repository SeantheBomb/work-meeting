import * as fs from "node:fs";
import * as path from "node:path";
import { CardDef, GameConfig } from "../../../shared/types";
import { DEFAULT_CONFIG, DEFAULT_DECK } from "../../../shared/cards";
import { MatchStats, simulateOneMatch } from "./simulate";

interface ScenarioConfig {
  label: string;
  deck: CardDef[];
  config: GameConfig;
  playerCounts: number[];
  gamesPerPlayerCount: number;
}

interface CardAggRow {
  id: string;
  name: string;
  timesLegal: number;
  timesChosen: number;
  timesWon: number;
  timesBounced: number;
}

function aggregateCards(deck: CardDef[], statsList: MatchStats[]): CardAggRow[] {
  const rows = new Map<string, CardAggRow>();
  for (const c of deck) rows.set(c.id, { id: c.id, name: `${c.topic ?? "Universal"}-${c.name}`, timesLegal: 0, timesChosen: 0, timesWon: 0, timesBounced: 0 });
  for (const s of statsList) {
    for (const [id, n] of s.cardLegalCounts) rows.get(id)!.timesLegal += n;
    for (const [id, n] of s.cardChosenCounts) rows.get(id)!.timesChosen += n;
    for (const [id, n] of s.cardWinCounts) rows.get(id)!.timesWon += n;
    for (const [id, n] of s.cardBounceCounts) rows.get(id)!.timesBounced += n;
  }
  return [...rows.values()];
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function stddev(nums: number[]): number {
  const m = mean(nums);
  return Math.sqrt(mean(nums.map((n) => (n - m) ** 2)));
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`;
}

function runScenario(scenario: ScenarioConfig, verbose = true) {
  const lines: string[] = [];
  lines.push(`\n=== ${scenario.label} ===`);
  lines.push(`Deck size: ${scenario.deck.length} | Hand size: ${scenario.config.handSize} | Starting Duration: ${scenario.config.startingDuration}`);

  const byPlayerCount: Record<number, MatchStats[]> = {};

  for (const numPlayers of scenario.playerCounts) {
    const results: MatchStats[] = [];
    for (let i = 0; i < scenario.gamesPerPlayerCount; i++) {
      results.push(simulateOneMatch(numPlayers, scenario.deck, scenario.config, i * 7919 + numPlayers));
    }
    byPlayerCount[numPlayers] = results;

    const rounds = results.map((r) => r.rounds);
    const totalDecisions = results.reduce((a, r) => a + r.totalPlayerDecisions, 0);
    const zeroLegal = results.reduce((a, r) => a + r.zeroLegalDecisions, 0);
    const oneLegal = results.reduce((a, r) => a + r.oneLegalDecisions, 0);
    const twoPlusLegal = results.reduce((a, r) => a + r.twoPlusLegalDecisions, 0);
    const avgLegal = results.reduce((a, r) => a + r.legalCountSum, 0) / totalDecisions;

    const reasonCounts = new Map<string, number>();
    for (const r of results) reasonCounts.set(r.endReason, (reasonCounts.get(r.endReason) ?? 0) + 1);
    const reasonStr = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `${reason} ${pct(n, results.length)}`)
      .join(", ");

    lines.push(
      `  ${numPlayers}P (n=${scenario.gamesPerPlayerCount}): rounds ${mean(rounds).toFixed(1)} ± ${stddev(rounds).toFixed(1)} | ` +
        `Shared Agenda ${pct(results.filter((r) => r.sharedAgendaSuccess).length, results.length)} | ` +
        `softlock/safety-cap ${pct(results.filter((r) => r.hitSafetyCap).length, results.length)}`
    );
    lines.push(`    End reasons: ${reasonStr}`);
    lines.push(
      `    Decision space: avg ${avgLegal.toFixed(2)} legal cards/turn | 0-legal ${pct(zeroLegal, totalDecisions)} | ` +
        `1-legal ${pct(oneLegal, totalDecisions)} | 2+legal ${pct(twoPlusLegal, totalDecisions)}`
    );
  }

  const allResults = Object.values(byPlayerCount).flat();
  const cardRows = aggregateCards(scenario.deck, allResults);
  const totalTurns = allResults.reduce((a, r) => a + r.totalPlayerDecisions, 0);
  const rowsToPrint = verbose ? cardRows : cardRows.filter((r) => r.name.startsWith("Universal"));

  lines.push(`\n  Card usage${verbose ? "" : " (universal cards only)"} (sorted by times legally available):`);
  rowsToPrint
    .sort((a, b) => b.timesLegal - a.timesLegal)
    .forEach((row) => {
      const legalRate = pct(row.timesLegal, totalTurns);
      const chooseRate = row.timesLegal === 0 ? "n/a" : pct(row.timesChosen, row.timesLegal);
      const winRate = row.timesChosen === 0 ? "n/a" : pct(row.timesWon, row.timesChosen);
      const flag = row.timesLegal === 0 ? "  <-- NEVER LEGAL (dead)" : row.timesLegal < totalTurns * 0.005 ? "  <-- rarely legal" : "";
      lines.push(
        `    ${row.name.padEnd(24)} legal ${String(row.timesLegal).padStart(5)} (${legalRate.padStart(6)})  chosen-when-legal ${chooseRate.padStart(6)}  win-when-chosen ${winRate.padStart(6)}${flag}`
      );
    });

  const report = lines.join("\n");
  console.log(report);
  return report;
}

function withOvertimeAttack(deck: CardDef[], attack: number): CardDef[] {
  return deck.map((c) => (c.id === "Overtime" ? { ...c, attack } : c));
}

function withExtraNewBusiness(deck: CardDef[], extraCopies: number): CardDef[] {
  const template = deck.find((c) => c.id === "NewBusinessA")!;
  const extras: CardDef[] = Array.from({ length: extraCopies }, (_, i) => ({
    ...template,
    id: `NewBusinessExtra${i}`,
  }));
  return [...deck, ...extras];
}

function main() {
  const GAMES_PER_CONFIG = Number(process.env.SIM_GAMES ?? 800);
  const PLAYER_COUNTS = [2, 4, 8];

  // withOvertimeAttack/withExtraNewBusiness are kept around as reusable levers for
  // future balance experiments -- the current tuning from the first pass is already
  // baked into DEFAULT_DECK/DEFAULT_CONFIG (shared/cards.ts), so this just runs that.
  const scenarios: ScenarioConfig[] = [
    {
      label: "CURRENT (deck-drafted, hand 5, Overtime atk 3, New Business x4)",
      deck: DEFAULT_DECK,
      config: DEFAULT_CONFIG,
      playerCounts: PLAYER_COUNTS,
      gamesPerPlayerCount: GAMES_PER_CONFIG,
    },
  ];

  const allReports = scenarios.map((s) => runScenario(s, true));

  const outDir = path.join(__dirname, "..", "..", "..", "sim-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `report-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  fs.writeFileSync(outFile, allReports.join("\n\n"));
  console.log(`\nFull report written to ${outFile}`);
}

main();
