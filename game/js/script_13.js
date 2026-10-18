  // hide boot splash once the title screen is up
  (function wait() { if (window.game && window.game.state !== 'boot') document.getElementById('boot').style.display = 'none'; else setTimeout(wait, 100); })();
