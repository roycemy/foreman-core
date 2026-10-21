/* Handoff choreography. Trigger: event kind 'handoff' with toAgentId (api/index.js work.handoff / owner move).
   Both bots path to MEET seats (~4.5s total incl. walk), bubble shows from both arrive -> +2.2s, table glows once, then walk home. */
window.MeetingRoom = {
  SEATS: [[54, 64], [70, 54]], // world coords at the map table (see screens/iso.js ROOMS.meeting)
  run(floor, fromBot, toBot, title) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const text = `Handing you the ${title || 'work'}`;
    if (reduce) { floor.bubble(toBot, text, 2200); return; } // no walk; bubble only, over the receiving bot
    floor.walk(fromBot, this.SEATS[0]); floor.walk(toBot, this.SEATS[1]);
    floor.whenArrived([fromBot, toBot], () => { floor.glow('meeting'); floor.bubble(fromBot, text, 2200); setTimeout(() => { floor.walkHome(fromBot); floor.walkHome(toBot); }, 2200); });
  }
};
