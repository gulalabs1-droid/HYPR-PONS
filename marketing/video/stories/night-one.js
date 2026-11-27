// "Night one": for creators. Nobody, then one person, then the regulars.
(() => {
  const HOST = 150, MAYA = 330, JUN = 200, RAE = 45, KOFI = 100, SOL = 265;
  const bg = h("div", "layer");
  const glowA = h("div", "glow", undefined, bg), glowB = h("div", "glow", undefined, bg);
  Object.assign(glowA.style, { width: "95vmin", height: "95vmin", left: "-30vmin", top: "-20vmin", background: "#1e3a5f" });
  Object.assign(glowB.style, { width: "80vmin", height: "80vmin", right: "-30vmin", bottom: "-20vmin", background: "#5a2a7a" });

  const nights = [
    caption(["*Night 1.*", "You talk to an empty room."]),
    caption(["*Night 4.*", "Someone says hi."]),
    caption(["*Night 9.*", "They bring a friend."]),
    caption(["*Night 23.*", "And one night you notice…"]),
  ];
  const capTruth = caption(["You never needed millions.", "You needed the ones *who come back.*"], "center");
  const capHypr = caption(["HYPR remembers", "*who keeps showing up.*"]);

  const stage = h("div", "stage");
  const p = player(stage, { h1: HOST, initial: "D" });
  const c = chat(stage);
  const between = h("span", "pill idle", "Between shows", p.node);
  Object.assign(between.style, { position: "absolute", left: "2.4vmin", top: "2.4vmin" });

  const regulars = h("div", "card", `<div class="t"><small>Your regulars · came back on another day</small><strong>maya, jun, sol, kofi, rae</strong></div>`, p.node);
  Object.assign(regulars.style, { position: "absolute", left: "2.4vmin", right: "2.4vmin", bottom: "2.4vmin", padding: "1.8vmin 2.2vmin", background: "rgba(17,17,23,.9)", flexDirection: "column", alignItems: "flex-start", gap: "1.4vmin" });
  const stack = h("div", "", undefined, regulars);
  Object.assign(stack.style, { display: "flex", order: -1 });
  [MAYA, JUN, SOL, KOFI, RAE].forEach((hh, i) => {
    const a = h("span", "", undefined, stack);
    Object.assign(a.style, { width: "5.4vmin", height: "5.4vmin", borderRadius: "50%", background: avatar(hh), border: ".45vmin solid #17171f", marginLeft: i ? "-1.4vmin" : "0" });
  });
  const stackAvatars = [...stack.children];

  // Each night's chat, shown only during that night.
  const groups = [
    [],
    [["maya", "hi! found you by accident", MAYA, 5.6], ["dani", "omg hi maya 🥹 welcome", HOST, 6.9, true]],
    [["maya", "told my brother about this", MAYA, 9.3], ["jun", "hi from maya's brother lol", JUN, 10.3], ["dani", "the family's here!!", HOST, 11.3, true]],
    [["rae", "first time, saw a clip", RAE, 13.0], ["jun", "hey rae 👋", JUN, 13.45], ["kofi", "back from last week", KOFI, 13.9], ["sol", "same seat as always", SOL, 14.35], ["maya", "been here since night 4 🫶", MAYA, 15.0]],
  ].map(group => group.map(([name, text, hh, at, host]) => ({ node: message(c.list, name, text, hh, { host }), at })));
  const windows = [[0, 4.5], [4.5, 8.5], [8.5, 12.5], [12.5, 99]];
  const special = groups[3][4].node;

  const brand = h("div", "brand", `<div class="mark"><i>H</i><span>HYPR</span></div><h2>Go live from your browser.<br><em>Keep your room between shows.</em></h2><span class="btn">Start your room</span><div class="url">hypr-pons.vercel.app/creators</div><small>Robinhood Chain testnet preview · Free to start</small>`);
  const brandParts = [...brand.children];

  defineStory({
    duration: 33,
    dramatization: [0.6, 27.6],
    update(t) {
      const warm = P(t, 4.5, 12, E.inOut);
      style(glowA, (.35 + .3 * warm) * (t > 17.4 && t < 21.8 ? .4 : 1), { x: Math.sin(t / 6) * 3 });
      style(glowB, (.15 + .4 * warm) * (t > 17.4 && t < 21.8 ? .4 : 1));

      nights[0].at(t, .6, 4.5, .14); nights[1].at(t, 4.7, 8.5, .14); nights[2].at(t, 8.7, 12.5, .14); nights[3].at(t, 12.7, 17.4, .14);
      const stageIn = Math.min(W(t, .8, 17.5, .9, .7) + W(t, 21.8, 27.7, .9, .7), 1);
      style(stage, stageIn, { y: (1 - P(t, t > 20 ? 21.8 : .8, 1.1)) * 4 });

      p.voice(t, t < 17.5 ? (t < 4.5 ? .5 : 1) : 0);
      p.node.querySelector(".wave").style.opacity = t < 17.5 ? 1 : 0;
      style(p.pill, t < 17.5 ? 1 : 0);
      style(between, P(t, 22.0, .6));
      // In the wide format the card would cover the host, so the avatar makes room.
      if (FORMAT === "h") { const k = P(t, 22.8, .8, E.inOut); style(p.host, t < 17.5 || t > 21.8 ? 1 : 0, { y: -6 * k, s: 1 - .4 * k }); }
      style(regulars, P(t, 23.0, .7), { y: (1 - P(t, 23.0, .8, E.back)) * 3 });
      stackAvatars.forEach((a, i) => style(a, P(t, 23.4 + i * .2, .4), { s: .6 + .4 * P(t, 23.4 + i * .2, .5, E.back) }));

      const night = windows.findIndex(([a, b]) => t >= a && t < b);
      const header = c.node.querySelector("header span");
      header.textContent = t >= 21.8 ? "between shows" : ["night 1", "night 4", "night 9", "night 23"][night] || "";
      groups.forEach((group, g) => group.forEach(m => {
        if (g === 3 && t >= 21.8) { m.node.style.display = ""; style(m.node, P(t, 22.2, .6)); return; }
        const [a, b] = windows[g];
        const out = 1 - P(t, b - .35, .35);
        if (t < a || t >= b) { m.node.style.display = "none"; return; }
        pop(m.node, t, m.at, out);
      }));
      special.style.background = t > 15.0 ? `rgba(211,251,90,${.12 * P(t, 15.2, .8)})` : "transparent";
      special.style.borderRadius = "1.4vmin";
      special.style.padding = ".4vmin 1vmin";
      style(c.empty, t < 4.5 ? 1 : 0);

      // Night 1: the host types into the void, then deletes it.
      const typed = t < 2.0 ? "" : t < 3.0 ? "anyone here?".slice(0, Math.floor((t - 2.0) * 14)) : t < 3.5 ? "anyone here?" : "anyone here?".slice(0, Math.max(0, 12 - Math.floor((t - 3.5) * 20)));
      c.composer.querySelector(".typed").textContent = t < 4.5 ? typed : "";
      c.composer.querySelector(".ph").style.display = t < 4.5 && typed ? "none" : "";
      c.composer.querySelector(".caret").style.opacity = Math.floor(t * 2.2) % 2 ? .2 : 1;

      capTruth.at(t, 17.8, 21.7, .17);
      capHypr.at(t, 22.1, 27.6, .13);

      brandParts.forEach((part, i) => { const k = P(t, 27.9 + i * .22, .8); style(part, k, { y: (1 - k) * 2.5, blur: (1 - k) * .8 }); });
      brand.style.visibility = t > 27.8 ? "visible" : "hidden";
    },
  });
})();
