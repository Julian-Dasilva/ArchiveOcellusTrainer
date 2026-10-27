export const FULL_FIGHT_CSS = `
.fight-hud {
  position: absolute;
  top: 8px;
  left: 92px;
  padding: 6px 10px;
  background: rgba(16, 12, 8, 0.72);
  border: 1px solid #5a4a2e;
  border-radius: 2px;
  font-family: "OSRS", sans-serif;
  color: #ff981f;
  text-shadow: 1px 1px 0 black;
  pointer-events: none;
  min-width: 110px;
}

.fight-hud-phase {
  font-size: 18px;
}

.fight-hud-timer {
  font-size: 22px;
  color: #fff;
}

.fight-hud-tick {
  font-size: 14px;
  color: #c8b88a;
}

.fight-loading {
  position: absolute;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: "OSRS", sans-serif;
  font-size: 16pt;
  color: #ffff00;
  text-shadow: 1px 1px 0 black;
  pointer-events: none;
}

.fight-loading-bar {
  width: min(50%, 420px);
  height: 14px;
  background: #282828;
  border: 1px solid #ffff00;
}

.fight-loading-bar > div {
  height: 100%;
  background: #ffff00;
  transition: width 0.2s linear;
}

.fight-loading-note {
  font-size: 11pt;
  color: #c8b88a;
}

.fight-result {
  position: absolute;
  top: 30%;
  left: 50%;
  transform: translateX(-60%);
  padding: 18px 24px;
  background: rgba(30, 24, 16, 0.94);
  border: 2px solid #6b5b3e;
  font-family: "OSRS", sans-serif;
  color: #ff981f;
  text-align: center;
  text-shadow: 1px 1px 0 black;
  min-width: 300px;
}

.fight-result h2 {
  margin: 0 0 8px;
  font-weight: normal;
  font-size: 28px;
}

.fight-result p {
  color: #fff;
  margin: 0 0 14px;
  font-size: 18px;
}

.fight-result-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.fight-result-follow {
  margin: 12px 0 0;
  font-size: 13px;
  color: #c8b88a;
}

.fight-result-follow a {
  color: #ff981f;
}

@media (max-width: 900px), (max-height: 600px) {
  .fight-hud {
    padding: 2px 6px;
    min-width: 0;
  }

  .fight-hud-phase,
  .fight-hud-tick {
    font-size: 10px;
  }

  .fight-hud-timer {
    font-size: 12px;
  }
}
`;
