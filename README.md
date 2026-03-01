# ZIA: Become a Legend

A digital clone of **Xia: Legends of a Drift System** — a sandbox space game where you trade, fight, explore, complete missions, and earn fame to become a legend.

## What's included

- **App shell**: Vue 3 + Pinia + Vue Router, NobleProvider, [@noble/bg-engine](https://github.com/your-org/noble-bg-engine).
- **Views**: Lobby (create game, list games, join with color), Join (claim seat + color), Game (header, turn cue, abandon vote, hex board).
- **Game**: Hex-based drift map, ships (engine, weapons, hull, cargo), movement (roll + engine = movement points), trade (buy/sell goods by sector), combat (attack other ships in same sector), exploration (first visit grants fame), missions (deliver, explore, bounty). First to 20 fame wins.
- **Auth**: `useAuth` for register/login and session sync; works with dev fallback when server returns 501.

## Running the app

1. Install and run:
   ```bash
   npm install
   npm run dev
   ```
2. Ensure the engine is available at the path in `package.json` (e.g. `"@noble/bg-engine": "file:../noble-bg-engine/packages/engine"`).

## Game contract

The shell expects from `src/logic/game-logic.ts`:

- **gameDef** — id `zia`, displayName `ZIA: Become a Legend`, description, min/max players, boardgame.io Game (setup, moves, endIf, turn).
- **PLAYER_COLORS** — `['red','blue','green','yellow']`.
- **PlayerColor** — type.
- **getPlayerRankings(G)** — returns `{ playerId, score, cities }[]` by fame for the game-over table.

Session and API calls use `gameDef.id` and `gameDef.displayName`.

## Extension points

- **Bots**: Replace `src/composables/useBotPlayers.ts` to add AI players.
- **Balance**: Tweak `FAME_TO_WIN`, rewards, ship stats, and sector prices in `game-logic.ts`.
- **Missions**: Add more missions in setup or dynamic deck drawing.
