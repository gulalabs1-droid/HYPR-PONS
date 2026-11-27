// "The room stays": a stream ends and everything goes with it, except on HYPR.
(() => {
  const OWL = 32, HOST = 280;
  const bg = h("div", "layer");
  const glowA = h("div", "glow", undefined, bg), glowB = h("div", "glow", undefined, bg);
  Object.assign(glowA.style, { width: "90vmin", height: "90vmin", left: "-20vmin", top: "-10vmin", background: "#3b2a8a" });
  Object.assign(glowB.style, { width: "80vmin", height: "80vmin", right: "-25vmin", bottom: "-15vmin", background: "#7a1f3d" });

  const capA = caption(["Every night,", "someone goes *live.*"], "center");
  const capB = caption(["Most nights,", "almost no one comes."]);
  const capC = caption(["But sometimes,", "*someone stays.*"]);
  const capD = caption(["Then the stream ends.", { cls: "dim", text: "And it's all gone." }]);
  const capE = caption([{ cls: "dim", text: "The chat. The jokes." }, "The person who stayed."], "center");
  const capF = caption(["On HYPR,", "the room *stays open.*"]);
  const capG = caption(["Streams end.", "*Communities shouldn't.*"], "center");

  const dot = h("div", "ring");
  Object.assign(dot.style, { left: "50%", top: "calc(50% - 22vmin)", width: "4vmin", height: "4vmin", margin: "0 0 0 -2vmin", background: "var(--live)", boxShadow: "0 0 6vmin var(--live)" });

  const stage = h("div", "stage");
  const p = player(stage, { h1: HOST, initial: "J" });
  const c = chat(stage);
  const between = h("span", "pill idle", "Between shows", p.node);
  Object.assign(between.style, { position: "absolute", left: "2.4vmin", top: "2.4vmin" });
  const next = h("div", "card", `<div class="t"><small>Next show</small><strong>Friday · 9:00 PM</strong></div><span class="btn ghost">Remind me</span>`, p.node);
  Object.assign(next.style, { position: "absolute", left: "2.4vmin", right: "2.4vmin", bottom: "2.4vmin", padding: "1.6vmin 2vmin", background: "rgba(17,17,23,.88)" });
  const remind = next.querySelector(".btn");

  const m1 = message(c.list, "nightowl", "first time here. this is actually really good", OWL);
  const m2 = message(c.list, "juno", "wait hi!! welcome 🥹", HOST, { host: true });
  const m3 = message(c.list, "nightowl", "staying till the end", OWL);
  const day = dayMarker(c.list, "Tuesday");
  const m4 = message(c.list, "nightowl", "back again 👋 when's the next one?", OWL);
  const m5 = message(c.list, "juno", "friday 9pm. saving you a seat", HOST, { host: true });
  const first = [m1, m2, m3];
  // Wide format: all six lines must fit, or the first night's message scrolls out of view.
  if (FORMAT === "h") [m1, m2, m3, m4, m5].forEach(m => { m.style.fontSize = "2.45vmin"; });

  const brand = h("div", "brand", `<div class="mark"><i>H</i><span>HYPR</span></div><h2>Watch live.<br><em>Stay for the community.</em></h2><p>Free to watch · No wallet needed</p><div class="url">hypr-pons.vercel.app</div><small>Robinhood Chain testnet preview</small>`);
  const brandParts = [...brand.children];

  defineStory({
    duration: 37,
    dramatization: [3.6, 27.8],
    update(t) {
      style(glowA, .55 * W(t, 0, 37, 2, 2) * (t > 18 && t < 21.4 ? .3 : 1));
      style(glowB, .35 * W(t, 2, 37, 3, 2) * (t > 13.5 && t < 21.4 ? .2 : 1), { x: Math.sin(t / 5) * 4 });
      glowA.style.background = t > 21.2 ? "#4b3bb0" : "#3b2a8a";

      // Opening: a lone live dot.
      const d = W(t, .4, 4.2, .8, .6);
      style(dot, d * (.65 + .35 * Math.abs(Math.sin(t * 2.4))), { s: 1 + .1 * Math.sin(t * 2.4) });
      capA.at(t, .9, 4.0, .16);

      // The stream: almost nobody.
      const stageIn = Math.min(W(t, 3.6, 18.4, .9, .8) + W(t, 21.2, 27.9, .9, .7), 1);
      style(stage, stageIn, { y: (1 - P(t, 3.6, 1.1)) * 4 + (1 - P(t, 21.2, 1.1)) * (t > 20 ? 4 : 0) });
      capB.at(t, 3.9, 8.3, .12);
      capC.at(t, 8.4, 13.3, .12);
      capD.at(t, 13.5, 18.2, .12);

      const liveNow = t < 13.7;
      p.voice(t, liveNow ? 1 : 0);
      style(p.pill, liveNow ? 1 : 0);
      p.node.querySelector(".wave").style.opacity = t < 13.7 ? 1 : t > 21 ? 0 : 0;
      style(p.ended, P(t, 13.7, .7) * (1 - P(t, 20.4, .6)));
      style(p.host, t < 13.7 ? 1 : t > 21.2 ? P(t, 21.6, .8) : 0);
      style(between, P(t, 21.8, .6));
      if (FORMAT === "h") { const k = P(t, 25.4, .8, E.inOut); style(p.host, t < 13.7 ? 1 : t > 21.2 ? P(t, 21.6, .8) : 0, { y: -5.5 * k, s: 1 - .4 * k }); }
      style(next, P(t, 25.6, .6), { y: (1 - P(t, 25.6, .7, E.back)) * 3 });
      const reminded = t > 26.6;
      remind.className = `btn ${reminded ? "done" : "ghost"}`;
      remind.textContent = reminded ? "✓ Reminder set" : "Remind me";
      style(remind, 1, { s: 1 - .08 * Math.max(0, 1 - Math.abs(t - 26.55) * 8) });

      // First night's messages, then they dissolve when the stream ends.
      const dissolve = (i) => t < 21 ? 1 - P(t, 15.2 + i * .35, 1.1, E.inOut) : 1;
      [9.0, 10.8, 12.1].forEach((a, i) => {
        const back = t >= 21 ? P(t, 22.0 + i * .18, .5) : 1;
        // They come back sharp: the dissolve's blur must not linger.
        if (t >= 21) { first[i].style.display = ""; style(first[i], back, { y: (1 - back) * 2, blur: (1 - back) * .6 }); return; }
        pop(first[i], t, a, dissolve(i));
        if (t > 15) first[i].style.filter = `blur(${(1 - dissolve(i)) * .9}vmin)`;
      });
      style(c.empty, t < 8.9 ? 1 : 0);
      c.empty.textContent = "Chat is quiet. Say hi.";
      pop(day, t, 23.3); pop(m4, t, 23.8); pop(m5, t, 25.0);
      c.node.querySelector("header span").textContent = t < 13.7 ? "live" : t > 21.2 ? "between shows" : "closed";
      c.type(t, 99, "");

      capE.at(t, 18.4, 21.3, .2);
      capF.at(t, 21.5, 27.8, .12);
      capG.at(t, 28.1, 31.8, .2);

      // Brand.
      const b = P(t, 32.0, 1);
      brandParts.forEach((part, i) => { const k = P(t, 32.0 + i * .22, .8); style(part, k, { y: (1 - k) * 2.5, blur: (1 - k) * .8 }); });
      brand.style.visibility = t > 31.9 ? "visible" : "hidden";
      brand.style.opacity = b;
    },
  });
})();
