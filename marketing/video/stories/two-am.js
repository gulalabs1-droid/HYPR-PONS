// "2:14 am": for viewers. Can't sleep, find a room that's awake, someone says your name back.
(() => {
  const HOST = 20, SOL = 265, KOFI = 100, ME = 190;
  const bg = h("div", "layer");
  const glowA = h("div", "glow", undefined, bg), glowB = h("div", "glow", undefined, bg);
  Object.assign(glowA.style, { width: "90vmin", height: "90vmin", left: "-25vmin", top: "-15vmin", background: "#14244a" });
  Object.assign(glowB.style, { width: "85vmin", height: "85vmin", right: "-30vmin", bottom: "-20vmin", background: "#6b3a1f" });

  const clock = h("div", "big-mono", `2<span class="colon">:</span>14<small style="font-size:.28em;margin-left:.25em;color:var(--muted)">AM</small>`);
  clock.style.top = "30%";
  const colon = clock.querySelector(".colon");
  const capSleep = caption([{ cls: "dim", text: "Everyone you know" }, { cls: "dim", text: "is asleep." }], "center");
  capSleep.node.style.top = "62%";
  const capScroll = caption(["You've been scrolling for an hour.", { cls: "dim", text: "Nothing feels like anything." }], "center");
  const capFind = caption(["Then you find a room", "*that's still awake.*"]);
  const capName = caption(["You say hi.", "*Someone says your name back.*"]);
  const capHome = caption(["Some places feel like home.", "*Even online.*"], "center");

  const stage = h("div", "stage");
  const p = player(stage, { h1: HOST, initial: "R" });
  const title = h("div", "", "late talks &amp; lofi", p.node);
  Object.assign(title.style, { position: "absolute", left: "2.4vmin", bottom: "2.2vmin", font: "700 2.6vmin var(--sans)", color: "var(--soft)" });
  const c = chat(stage);

  const msgs = [
    ["sol", "can't sleep either?", SOL, 9.8],
    ["rae", "pull up a chair", HOST, 10.8, true],
    ["kofi", "we're talking about first concerts", KOFI, 11.8],
    ["sol", "mine was in a parking lot 😭", SOL, 12.9],
    ["moth", "hi, first time here", ME, 16.3],
    ["rae", "moth!! welcome, grab a seat 🌙", HOST, 17.3, true],
  ].map(([name, text, hh, at, host]) => ({ node: message(c.list, name, text, hh, { host }), at }));

  const brand = h("div", "brand", `<div class="mark"><i>H</i><span>HYPR</span></div><h2>Find your room.</h2><p>Free to watch. No wallet. Just a nickname.</p><div class="url">hypr-pons.vercel.app</div><small>Robinhood Chain testnet preview</small>`);
  const brandParts = [...brand.children];

  defineStory({
    duration: 28,
    dramatization: [8.8, 18.6],
    update(t) {
      const awake = P(t, 8.8, 3, E.inOut);
      style(glowA, .25 + .3 * awake);
      style(glowB, .08 + .42 * awake * (t > 18.6 && t < 22.4 ? .6 : 1), { x: Math.sin(t / 5) * 3 });

      style(clock, W(t, .4, 4.8, 1.2, .8), { s: 1 + .03 * P(t, 0, 5, E.lin) });
      colon.style.opacity = Math.floor(t * 1.0) % 2 ? .25 : 1;
      capSleep.at(t, 1.6, 4.8, .2);
      capScroll.at(t, 5.0, 8.6, .12);

      style(stage, W(t, 8.8, 18.7, .9, .7), { y: (1 - P(t, 8.8, 1.1)) * 4 });
      p.voice(t, .8);
      capFind.at(t, 9.0, 14.2, .13);
      capName.at(t, 14.4, 18.6, .13);
      msgs.forEach(m => pop(m.node, t, m.at));
      style(c.empty, t < 9.7 ? 1 : 0);
      c.type(t, 14.6, t < 16.3 ? "hi, first time here" : "", 12);
      if (t >= 16.3) { c.composer.querySelector(".typed").textContent = ""; c.composer.querySelector(".ph").style.display = ""; }
      const mine = msgs[4].node;
      mine.style.background = t > 16.3 ? "rgba(110,231,249,.10)" : "transparent";
      mine.style.borderRadius = "1.4vmin"; mine.style.padding = ".4vmin 1vmin";

      capHome.at(t, 18.9, 22.3, .2);
      brandParts.forEach((part, i) => { const k = P(t, 22.6 + i * .24, .8); style(part, k, { y: (1 - k) * 2.5, blur: (1 - k) * .8 }); });
      brand.style.visibility = t > 22.5 ? "visible" : "hidden";
    },
  });
})();
