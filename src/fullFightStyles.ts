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

.fight-chat {
  position: absolute;
  left: 6px;
  bottom: 6px;
  width: min(500px, 46vw);
  background: rgba(214, 202, 168, 0.88);
  border: 2px solid #4a3c26;
  box-shadow: inset 0 0 0 1px #8a7650;
  font-family: "OSRS", sans-serif;
  font-size: 16px;
  line-height: 17px;
  text-shadow: none;
  pointer-events: none;
}

.fight-chat-lines {
  height: 136px;
  overflow: hidden;
  padding: 4px 8px 2px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.fight-chat-input {
  border-top: 1px solid #8a7650;
  padding: 2px 8px 3px;
  color: #000;
}

.fight-chat-caret {
  color: #0000ff;
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

.fight-sidebar {
  font-family: "OSRS", sans-serif;
  font-size: 16px;
  color: #ff981f;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fight-sidebar label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: #ffcf8a;
}

.fight-sidebar label.fight-check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.fight-sidebar select {
  font: inherit;
  font-size: 14px;
  background: #2b2418;
  color: #fff;
  border: 1px solid #6b5b3e;
  padding: 2px;
}

.fight-sidebar label.fight-key {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.fight-sidebar label.fight-key select {
  width: 72px;
}

.fight-keys-reset {
  align-self: flex-end;
  background: none;
  border: none;
  padding: 0;
  color: #c8b88a;
  font: inherit;
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}

.fight-title {
  margin: 2px 0 0;
  font-weight: normal;
  font-size: 26px;
  color: #ff981f;
  text-align: center;
}

.fight-subtitle {
  text-align: center;
  color: #c8b88a;
  font-size: 13px;
  margin-bottom: 4px;
}

.fight-tips-title {
  color: #ff981f;
}

.fight-tips ul,
.fight-credits {
  margin: 4px 0 0;
  padding-left: 16px;
  color: #e8dcc0;
  font-size: 13px;
  line-height: 15px;
}

.fight-tips li,
.fight-credits li {
  margin-bottom: 5px;
}

.fight-credits a {
  color: #ff981f;
}

@media (max-width: 900px), (max-height: 600px) {
  .fight-chat {
    width: min(300px, 55vw);
    font-size: 10px;
    line-height: 11px;
  }

  .fight-chat-lines {
    height: 56px;
    padding: 2px 4px 1px;
  }

  .fight-chat-input {
    padding: 1px 4px 2px;
  }

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
