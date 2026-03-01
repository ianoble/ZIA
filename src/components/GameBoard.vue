<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { useGame } from "@engine/client";
import { getPlayerRankings, type ZiaGameState, type Sector, type GoodType, type Mission } from "../logic/game-logic";
import { axialToPixel, axialAdjacent } from "../logic/hex";

const props = defineProps<{ headerHeight: number; gameover?: unknown }>();
const emit = defineEmits<{ "back-to-lobby": [] }>();

const { state, move, isMyTurn, playerID } = useGame();
const G = computed(() => state.value as unknown as ZiaGameState | undefined);

const gameIsOver = computed(() => !!props.gameover);
const gameOverDismissed = ref(false);

const sectorList = computed(() => {
	const s = G.value?.sectors;
	if (!s) return [];
	return Object.values(s);
});

const HEX_SIZE = 36;

const finalRankings = computed(() => {
	if (!gameIsOver.value || !G.value) return [];
	return getPlayerRankings(G.value);
});

/** Build score table rows: use endGameScoreBreakdown if present, else single Fame row from players. */
const finalScoreTableRows = computed(() => {
	if (!G.value?.players || !finalRankings.value.length) return [];
	const breakdown = G.value.endGameScoreBreakdown;
	const playerIds = finalRankings.value.map((r) => r.playerId);
	if (Object.keys(breakdown).length > 0) {
		const firstPid = playerIds[0];
		const labels = (breakdown[firstPid] ?? []).map((item) => item.label);
		const rows: { label: string; vpsByPlayer: Record<string, number> }[] = [];
		for (const label of labels) {
			const vpsByPlayer: Record<string, number> = {};
			for (const pid of playerIds) {
				const item = (breakdown[pid] ?? []).find((e) => e.label === label);
				vpsByPlayer[pid] = item?.vp ?? 0;
			}
			rows.push({ label, vpsByPlayer });
		}
		return rows;
	}
	// Zia: no breakdown set, use fame only
	return [
		{
			label: "Fame",
			vpsByPlayer: Object.fromEntries(playerIds.map((pid) => [pid, G.value!.players[pid].fame])),
		},
		{
			label: "Final score",
			vpsByPlayer: Object.fromEntries(playerIds.map((pid) => [pid, G.value!.players[pid].fame])),
		},
	];
});

const scoreRevealCurrentIndex = ref(0);
const scoreRevealDisplayValue = ref(0);
const scoreTableRevealComplete = ref(false);
const SCORE_CELL_DURATION_MS = 420;
const SCORE_CELL_MIN_MS = 180;
const SCORE_CELL_MAX_MS = 700;

function getScoreCellIndex(rowIdx: number, colIdx: number): number {
	return rowIdx * finalRankings.value.length + colIdx;
}

let scoreRevealRaf = 0;
let scoreRevealStartTime = 0;

function tickScoreReveal(timestamp: number) {
	if (!scoreRevealStartTime) scoreRevealStartTime = timestamp;
	const elapsed = timestamp - scoreRevealStartTime;
	const rows = finalScoreTableRows.value;
	const numPlayers = finalRankings.value.length;
	const totalCells = rows.length * numPlayers;
	const currentIdx = scoreRevealCurrentIndex.value;
	if (currentIdx >= totalCells) {
		scoreTableRevealComplete.value = true;
		return;
	}
	const rowIdx = Math.floor(currentIdx / numPlayers);
	const colIdx = currentIdx % numPlayers;
	const targetValue = rows[rowIdx]?.vpsByPlayer[finalRankings.value[colIdx]?.playerId ?? ""] ?? 0;
	const duration = Math.min(
		SCORE_CELL_MAX_MS,
		Math.max(SCORE_CELL_MIN_MS, SCORE_CELL_DURATION_MS + targetValue * 12)
	);
	const progress = Math.min(1, elapsed / duration);
	const easeOut = 1 - (1 - progress) * (1 - progress);
	scoreRevealDisplayValue.value = Math.round(easeOut * targetValue);
	if (progress >= 1) {
		scoreRevealCurrentIndex.value = currentIdx + 1;
		scoreRevealStartTime = timestamp;
		scoreRevealDisplayValue.value = 0;
		if (currentIdx + 1 < totalCells) {
			scoreRevealRaf = requestAnimationFrame(tickScoreReveal);
		} else {
			scoreTableRevealComplete.value = true;
		}
		return;
	}
	scoreRevealRaf = requestAnimationFrame(tickScoreReveal);
}

function startScoreTableReveal() {
	scoreRevealCurrentIndex.value = 0;
	scoreRevealDisplayValue.value = 0;
	scoreTableRevealComplete.value = false;
	scoreRevealStartTime = 0;
	if (finalScoreTableRows.value.length && finalRankings.value.length) {
		scoreRevealRaf = requestAnimationFrame(tickScoreReveal);
	} else {
		scoreTableRevealComplete.value = true;
	}
}

watch(
	[gameIsOver, gameOverDismissed],
	([over, dismissed]) => {
		if (!over || dismissed) return;
		const t = setTimeout(() => startScoreTableReveal(), 320);
		return () => clearTimeout(t);
	}
);

onUnmounted(() => {
	if (scoreRevealRaf) cancelAnimationFrame(scoreRevealRaf);
});

const PLAYER_COLOR_CLASSES: Record<string, string> = {
	red: "bg-red-500",
	blue: "bg-blue-500",
	green: "bg-green-500",
	yellow: "bg-yellow-400",
};

const myCredits = computed(() => {
	const pid = playerID?.value;
	if (!G.value?.players || pid == null) return 0;
	return G.value.players[pid]?.credits ?? 0;
});

const myFame = computed(() => {
	const pid = playerID?.value;
	if (!G.value?.players || pid == null) return 0;
	return G.value.players[pid]?.fame ?? 0;
});

const movementPointsRemaining = computed(() => G.value?.movementPointsRemaining ?? 0);

/** Sector IDs the current player can move to (adjacent, with movement points). */
const validMoveSectorIds = computed(() => {
	const g = G.value;
	const pid = playerID?.value;
	if (!g?.ships || !pid || movementPointsRemaining.value <= 0) return new Set<string>();
	const ship = g.ships[pid];
	const current = g.sectors[ship.sectorId];
	if (!current) return new Set<string>();
	const out = new Set<string>();
	for (const sid of Object.keys(g.sectors)) {
		const sec = g.sectors[sid];
		if (axialAdjacent({ q: current.q, r: current.r }, { q: sec.q, r: sec.r })) out.add(sid);
	}
	return out;
});

const myShip = computed(() => {
	const pid = playerID?.value;
	if (!G.value?.ships || pid == null) return null;
	return G.value.ships[pid] ?? null;
});

const mySector = computed(() => {
	const ship = myShip.value;
	if (!ship || !G.value?.sectors) return null;
	return G.value.sectors[ship.sectorId] ?? null;
});

const myCargoForGood = (goodType: GoodType): number => {
	const ship = myShip.value;
	if (!ship) return 0;
	const slot = ship.cargo.find((s) => s.goodType === goodType);
	return slot?.quantity ?? 0;
};

const availableMissions = computed(() => {
	const g = G.value;
	if (!g?.missionDeck?.length || !g?.missions) return [];
	return g.missionDeck.map((id) => g.missions[id]).filter(Boolean) as Mission[];
});

function canCompleteMission(mission: Mission): boolean {
	const g = G.value;
	const ship = myShip.value;
	if (!g || !ship) return false;
	if (mission.type === 'deliver') {
		if (mission.targetSectorId === undefined || mission.targetGood === undefined) return false;
		if (ship.sectorId !== mission.targetSectorId) return false;
		const slot = ship.cargo.find((s) => s.goodType === mission.targetGood);
		return !!(slot && slot.quantity >= 1);
	}
	if (mission.type === 'explore') {
		if (mission.targetSectorId === undefined) return false;
		const sector = g.sectors[mission.targetSectorId];
		return !!(sector && sector.explored);
	}
	if (mission.type === 'bounty') {
		if (mission.targetPlayerId === undefined) return false;
		const targetShip = g.ships[mission.targetPlayerId];
		return !!(targetShip && targetShip.hull <= 0);
	}
	return false;
}

function missionDescription(mission: Mission): string {
	if (mission.type === 'deliver') return `Deliver ${mission.targetGood} to ${G.value?.sectors[mission.targetSectorId!]?.name ?? mission.targetSectorId}`;
	if (mission.type === 'explore') return `Explore ${G.value?.sectors[mission.targetSectorId!]?.name ?? mission.targetSectorId}`;
	if (mission.type === 'bounty') {
		const color = G.value?.players[mission.targetPlayerId!]?.color ?? mission.targetPlayerId;
		return `Bounty: defeat ${color}`;
	}
	return mission.type;
}

/** Other player IDs in the same sector as my ship (for combat). */
const otherPlayersInMySector = computed(() => {
	const ship = myShip.value;
	if (!ship || !G.value?.ships) return [];
	return Object.entries(G.value.ships)
		.filter(([pid, s]) => pid !== playerID?.value && s.sectorId === ship.sectorId)
		.map(([pid]) => pid);
});

/** Ships at each sector (playerId[]). */
function shipsAtSector(sectorId: string): string[] {
	const ships = G.value?.ships;
	if (!ships) return [];
	return Object.entries(ships)
		.filter(([, ship]) => ship.sectorId === sectorId)
		.map(([pid]) => pid);
}

/** Pointy-top hex: flat on left/right. Vertices from center (size = apothem). */
function hexPoints(sector: Sector): string {
	const { x, y } = axialToPixel({ q: sector.q, r: sector.r }, HEX_SIZE);
	const r = HEX_SIZE;
	const sqrt3 = Math.sqrt(3);
	const verts = [
		[x + r * sqrt3 / 2, y - r / 2],
		[x + r * sqrt3 / 2, y + r / 2],
		[x, y + r],
		[x - r * sqrt3 / 2, y + r / 2],
		[x - r * sqrt3 / 2, y - r / 2],
		[x, y - r],
	];
	return verts.map(([px, py]) => `${px},${py}`).join(" ");
}

function hexCenter(sector: Sector): { x: number; y: number } {
	return axialToPixel({ q: sector.q, r: sector.r }, HEX_SIZE);
}
</script>

<template>
	<div class="w-full max-w-2xl mx-auto space-y-6">
		<p class="text-center text-slate-400 text-sm">
			Earn fame by trading, combat, exploration, and missions. First to 20 fame wins.
		</p>
		<div v-if="G?.players" class="flex flex-wrap justify-center gap-4 text-sm items-center">
			<span class="text-slate-400">Credits: <strong class="text-amber-300 tabular-nums">{{ myCredits }}</strong></span>
			<span class="text-slate-400">Fame: <strong class="text-amber-300 tabular-nums">{{ myFame }}</strong></span>
			<span v-if="movementPointsRemaining > 0" class="text-slate-400">Move: <strong class="text-cyan-300 tabular-nums">{{ movementPointsRemaining }}</strong></span>
			<button
				v-if="!gameIsOver && isMyTurn && movementPointsRemaining === 0"
				type="button"
				class="px-3 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white font-medium transition-colors"
				@click="move('rollMovement')"
			>
				Roll for movement
			</button>
			<button
				v-if="!gameIsOver && isMyTurn"
				type="button"
				class="px-3 py-1 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 font-medium transition-colors"
				@click="move('pass')"
			>
				Pass
			</button>
		</div>

		<!-- Trade panel: when at a sector, show buy/sell for that good -->
		<div
			v-if="mySector && !gameIsOver && isMyTurn"
			class="rounded-lg bg-slate-800/80 border border-slate-600 p-4 space-y-2"
		>
			<p class="text-slate-300 text-sm font-medium">At {{ mySector.name }} — {{ mySector.goodType }} (buy {{ mySector.buyPrice }}, sell {{ mySector.sellPrice }})</p>
			<p class="text-slate-400 text-xs">
				Cargo ({{ myShip?.cargo.reduce((s, c) => s + c.quantity, 0) ?? 0 }}/{{ myShip?.cargoCapacity ?? 0 }}):
				<span v-if="!myShip?.cargo.length">empty</span>
				<span v-else>{{ myShip?.cargo.map((c) => `${c.goodType}: ${c.quantity}`).join(', ') }}</span>
			</p>
			<button
				v-if="!mySector.explored"
				type="button"
				class="px-3 py-1 rounded bg-violet-700 hover:bg-violet-600 text-violet-100 text-sm"
				@click="move('explore', mySector.id)"
			>
				Explore sector (+2 fame)
			</button>
			<div class="flex gap-2">
				<button
					type="button"
					class="px-3 py-1 rounded bg-amber-700 hover:bg-amber-600 text-amber-100 text-sm disabled:opacity-50"
					:disabled="myCredits < mySector.buyPrice || (myShip?.cargo.reduce((s, c) => s + c.quantity, 0) ?? 0) >= (myShip?.cargoCapacity ?? 0)"
					@click="move('buyGoods', mySector.id, mySector.goodType, 1)"
				>
					Buy 1
				</button>
				<button
					type="button"
					class="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-emerald-100 text-sm disabled:opacity-50"
					:disabled="myCargoForGood(mySector.goodType) < 1"
					@click="move('sellGoods', mySector.id, mySector.goodType, 1)"
				>
					Sell 1
				</button>
			</div>
			<!-- Combat: attack other players in same sector -->
			<div v-if="otherPlayersInMySector.length" class="pt-2 border-t border-slate-600">
				<p class="text-slate-400 text-xs mb-1">Combat</p>
				<div class="flex gap-2 flex-wrap">
					<button
						v-for="targetId in otherPlayersInMySector"
						:key="targetId"
						type="button"
						class="px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-red-100 text-sm"
						@click="move('attack', targetId)"
					>
						Attack {{ G?.players[targetId]?.color ?? targetId }}
					</button>
				</div>
			</div>
		</div>

		<!-- Missions -->
		<div v-if="availableMissions.length && !gameIsOver" class="rounded-lg bg-slate-800/80 border border-slate-600 p-4 space-y-2">
			<p class="text-slate-300 text-sm font-medium">Missions</p>
			<ul class="space-y-1 text-sm">
				<li v-for="mission in availableMissions" :key="mission.id" class="flex items-center justify-between gap-2 text-slate-300">
					<span>{{ missionDescription(mission) }} — {{ mission.rewardFame }} fame, {{ mission.rewardCredits }} credits</span>
					<button
						v-if="isMyTurn && canCompleteMission(mission)"
						type="button"
						class="px-2 py-0.5 rounded bg-amber-700 hover:bg-amber-600 text-amber-100 text-xs shrink-0"
						@click="move('completeMission', mission.id)"
					>
						Complete
					</button>
				</li>
			</ul>
		</div>

		<!-- Hex map -->
		<div class="flex justify-center">
			<svg
				class="max-w-full"
				:viewBox="`${-HEX_SIZE * 2} ${-HEX_SIZE * 2} ${HEX_SIZE * 5} ${HEX_SIZE * 4}`"
				xmlns="http://www.w3.org/2000/svg"
			>
				<g v-for="sector in sectorList" :key="sector.id">
					<polygon
						:points="hexPoints(sector)"
						:class="[
							'stroke-[1.5] transition-colors',
							validMoveSectorIds.has(sector.id)
								? 'fill-cyan-900/60 stroke-cyan-500 hover:fill-cyan-800/80 cursor-pointer'
								: 'fill-slate-800 stroke-slate-600 hover:fill-slate-700',
						]"
						@click="validMoveSectorIds.has(sector.id) && move('moveShip', sector.id)"
					/>
					<text
						:x="hexCenter(sector).x"
						:y="hexCenter(sector).y - 6"
						class="text-[10px] fill-slate-300 text-center pointer-events-none"
						text-anchor="middle"
						dominant-baseline="middle"
					>
						{{ sector.name }}
					</text>
					<text
						:x="hexCenter(sector).x"
						:y="hexCenter(sector).y + 6"
						class="text-[8px] fill-slate-500 text-center pointer-events-none"
						text-anchor="middle"
						dominant-baseline="middle"
					>
						{{ sector.goodType }} {{ sector.buyPrice }}/{{ sector.sellPrice }}
					</text>
					<g v-for="(pid, i) in shipsAtSector(sector.id)" :key="pid">
						<circle
							:cx="hexCenter(sector).x + (i - (shipsAtSector(sector.id).length - 1) / 2) * 14"
							:cy="hexCenter(sector).y + 14"
							r="8"
							:class="[PLAYER_COLOR_CLASSES[G?.players[pid]?.color ?? ''] ?? 'bg-slate-500', 'stroke-slate-600 stroke-1']"
						/>
					</g>
				</g>
			</svg>
		</div>
	</div>

	<!-- Game Over: score table with count-up animation -->
	<div
		v-if="gameIsOver && !gameOverDismissed"
		class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center"
	>
		<div class="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl p-8 max-w-2xl w-full mx-4">
			<h2 class="text-2xl font-bold text-amber-300 text-center mb-2">Game Over</h2>
			<p class="text-amber-200/90 text-sm text-center mb-6 font-medium">Final Fame</p>
			<div class="overflow-x-auto">
				<table class="w-full text-sm border-collapse min-w-[280px]">
					<thead>
						<tr class="border-b border-slate-600">
							<th class="text-left py-2 pr-3 text-slate-400 font-medium">Score</th>
							<th
								v-for="(r, idx) in finalRankings"
								:key="r.playerId"
								class="py-2 px-2 text-center font-medium"
								:class="idx === 0 ? 'text-amber-300' : 'text-slate-300'"
							>
								<div class="flex items-center justify-center gap-1.5">
									<span
										class="w-3 h-3 rounded-full shrink-0"
										:class="PLAYER_COLOR_CLASSES[G?.players[r.playerId]?.color ?? '']"
									/>
									<span class="capitalize">{{ G?.players[r.playerId]?.color ?? '' }}</span>
									<span v-if="idx === 0" class="text-amber-400">★</span>
								</div>
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="(row, rowIdx) in finalScoreTableRows"
							:key="row.label"
							class="border-b border-slate-700/60"
							:class="row.label === 'Final score' ? 'border-t-2 border-amber-600/50 bg-slate-800/50' : ''"
						>
							<td class="py-1.5 pr-3 text-slate-400 font-medium">{{ row.label }}</td>
							<td
								v-for="(r, colIdx) in finalRankings"
								:key="r.playerId"
								class="py-1.5 px-2 text-center tabular-nums transition-all duration-150 rounded"
								:class="[
									row.label === 'Final score' ? 'text-amber-200 font-bold' : 'text-slate-200',
									getScoreCellIndex(rowIdx, colIdx) === scoreRevealCurrentIndex && !scoreTableRevealComplete
										? 'score-cell-active bg-amber-500/25 text-amber-100'
										: '',
								]"
							>
								<template v-if="getScoreCellIndex(rowIdx, colIdx) < scoreRevealCurrentIndex">
									{{ row.vpsByPlayer[r.playerId] ?? 0 }}
								</template>
								<template v-else-if="getScoreCellIndex(rowIdx, colIdx) === scoreRevealCurrentIndex && !scoreTableRevealComplete">
									{{ scoreRevealDisplayValue }}
								</template>
								<template v-else>
									{{ scoreTableRevealComplete ? (row.vpsByPlayer[r.playerId] ?? 0) : 0 }}
								</template>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="flex justify-center gap-3 mt-6">
				<button
					class="px-5 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-medium transition-colors cursor-pointer"
					@click="emit('back-to-lobby')"
				>
					Back to Lobby
				</button>
				<button
					class="px-5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium transition-colors cursor-pointer"
					@click="gameOverDismissed = true"
				>
					View Board
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
.score-cell-active {
	animation: score-cell-pulse 0.6s ease-in-out infinite;
}
@keyframes score-cell-pulse {
	0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.25); }
	50% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.15); }
}
</style>
