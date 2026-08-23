(function () {
  "use strict";

  // ---------- Globe init ----------
  const world = Globe({ rendererConfig: { preserveDrawingBuffer: true } })(
    document.getElementById("globeViz")
  )
    .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
    .backgroundImageUrl("https://unpkg.com/three-globe/example/img/night-sky.png")
    .backgroundColor("rgba(0,0,0,0)")
    .width(window.innerWidth)
    .height(window.innerHeight)
    .pointOfView({ lat: 20, lng: 0, altitude: 2.2 }, 0)
    .showAtmosphere(true)
    .atmosphereColor("#3a9bdc")
    .atmosphereAltitude(0.18)
    .htmlLat("lat")
    .htmlLng("lng")
    .htmlAltitude(0.015)
    .htmlElement((d) => {
      const el = document.createElement("div");
      el.className = "airport-badge";
      el.innerHTML = `<span class="dot"></span><span class="txt">${d.iata || d.icao} ${d.city || d.name}</span>`;
      return el;
    })
    .htmlElementsData([])
    .arcColor(() => ["#00d4ff", "#ff5b5b"])
    .arcAltitudeAutoScale(0.6)
    .arcDashLength(0.4)
    .arcDashGap(0.15)
    .arcDashAnimateTime(1800)
    .arcStroke(0.6)
    .arcsData([])
    .ringsData([])
    .ringColor(() => (t) => `rgba(0, 212, 255, ${1 - t})`)
    .ringMaxRadius(2.6)
    .ringPropagationSpeed(1.4)
    .ringRepeatPeriod(850);

  window.addEventListener("resize", () => {
    world.width(window.innerWidth).height(window.innerHeight);
  });

  // Slow ambient spin as an establishing/closing shot; paused during
  // playback so it doesn't fight with the scripted camera moves.
  const controls = world.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.3;

  // ---------- Dataset ----------
  // Loaded from data/airports.js (window.AIRPORTS_DATA), a plain <script> tag
  // rather than fetch()'d JSON, so the app also works when index.html is
  // opened directly via file:// (fetch() of local files is blocked there).
  const airports = window.AIRPORTS_DATA || [];
  if (!airports.length) {
    setStatus("Could not load airport data (data/airports.js).");
  }

  // ---------- Search / autocomplete ----------
  const searchInput = document.getElementById("searchInput");
  const suggestionsEl = document.getElementById("suggestions");
  let activeIndex = -1;
  let currentMatches = [];
  let debounceTimer = null;

  function rank(a, q) {
    const iata = (a.iata || "").toLowerCase();
    const icao = (a.icao || "").toLowerCase();
    if (iata === q || icao === q) return 0;
    if (iata.startsWith(q)) return 1;
    if (a.city.toLowerCase().startsWith(q)) return 2;
    if (a.name.toLowerCase().startsWith(q)) return 3;
    return 4;
  }

  function search(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return airports
      .filter(
        (a) =>
          (a.iata && a.iata.toLowerCase().startsWith(q)) ||
          (a.icao && a.icao.toLowerCase().startsWith(q)) ||
          a.city.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q)
      )
      .sort((a, b) => rank(a, q) - rank(b, q))
      .slice(0, 8);
  }

  function renderSuggestions(matches) {
    currentMatches = matches;
    activeIndex = -1;
    suggestionsEl.innerHTML = "";
    if (!matches.length) {
      suggestionsEl.classList.add("hidden");
      return;
    }
    matches.forEach((a, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="code">${a.iata || a.icao}</span>${a.name}, ${a.city}, ${a.country}`;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectAirport(a);
      });
      suggestionsEl.appendChild(li);
    });
    suggestionsEl.classList.remove("hidden");
  }

  function updateActiveHighlight() {
    Array.from(suggestionsEl.children).forEach((li, i) => {
      li.classList.toggle("active", i === activeIndex);
    });
  }

  function selectAirport(airport) {
    addToRoute(airport);
    searchInput.value = "";
    suggestionsEl.classList.add("hidden");
    suggestionsEl.innerHTML = "";
    currentMatches = [];
    searchInput.focus();
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const value = searchInput.value;
    debounceTimer = setTimeout(() => {
      renderSuggestions(search(value));
    }, 120);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (suggestionsEl.classList.contains("hidden") || !currentMatches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentMatches.length - 1);
      updateActiveHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveHighlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = currentMatches[activeIndex >= 0 ? activeIndex : 0];
      if (chosen) selectAirport(chosen);
    } else if (e.key === "Escape") {
      suggestionsEl.classList.add("hidden");
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#searchBox")) {
      suggestionsEl.classList.add("hidden");
    }
  });

  // ---------- Ordered route state ----------
  // mode "chain": stops connect in sequence, A -> B -> C -> D.
  // mode "hub": the first stop is a hub; every other stop is a destination
  // reachable directly from the hub (e.g. ZRH -> MUC and ZRH -> HAM).
  let route = [];
  let routeSeq = 0;
  let mode = "chain";

  const routeListEl = document.getElementById("routeList");
  const routeEmptyEl = document.getElementById("routeEmpty");
  const playBtn = document.getElementById("playBtn");
  const recordBtn = document.getElementById("recordBtn");
  const modeChainBtn = document.getElementById("modeChainBtn");
  const modeHubBtn = document.getElementById("modeHubBtn");
  const modeHintEl = document.getElementById("modeHint");

  const MODE_HINTS = {
    chain: "Stops connect in order: A → B → C.",
    hub: "First stop is the hub; every other stop is a destination from it.",
  };

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    modeChainBtn.classList.toggle("active", mode === "chain");
    modeHubBtn.classList.toggle("active", mode === "hub");
    modeHintEl.textContent = MODE_HINTS[mode];
    renderRouteList();
  }

  modeChainBtn.addEventListener("click", () => setMode("chain"));
  modeHubBtn.addEventListener("click", () => setMode("hub"));

  function addToRoute(airport) {
    route.push({ ...airport, uid: routeSeq++ });
    renderRouteList();
    updateGlobePoints();
  }

  function removeFromRoute(uid) {
    route = route.filter((r) => r.uid !== uid);
    renderRouteList();
    updateGlobePoints();
  }

  function moveInRoute(uid, direction) {
    const i = route.findIndex((r) => r.uid === uid);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= route.length) return;
    [route[i], route[j]] = [route[j], route[i]];
    renderRouteList();
    updateGlobePoints();
  }

  function renderRouteList() {
    routeListEl.innerHTML = "";
    routeEmptyEl.classList.toggle("hidden", route.length > 0);
    route.forEach((a, i) => {
      const li = document.createElement("li");

      const order = document.createElement("span");
      order.className = "order";
      order.textContent = mode === "hub" ? (i === 0 ? "Hub" : `${i}.`) : `${i + 1}.`;

      const label = document.createElement("span");
      label.className = "label";
      label.innerHTML = `<span class="code">${a.iata || a.icao}</span>${a.city || a.name}`;

      const upBtn = document.createElement("button");
      upBtn.textContent = "▲";
      upBtn.disabled = i === 0 || (mode === "hub" && i === 1);
      upBtn.title = "Move up";
      upBtn.addEventListener("click", () => moveInRoute(a.uid, -1));

      const downBtn = document.createElement("button");
      downBtn.textContent = "▼";
      downBtn.disabled = i === route.length - 1;
      downBtn.title = "Move down";
      downBtn.addEventListener("click", () => moveInRoute(a.uid, 1));

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "×";
      removeBtn.title = "Remove";
      removeBtn.addEventListener("click", () => removeFromRoute(a.uid));

      li.append(order, label, upBtn, downBtn, removeBtn);
      routeListEl.appendChild(li);
    });

    const enoughStops = route.length >= 2;
    playBtn.disabled = !enoughStops || isPlaying;
    recordBtn.disabled = !enoughStops || isPlaying || !recordingSupported;
  }

  function updateGlobePoints() {
    world.htmlElementsData(route);
  }

  // ---------- Arc animation sequencing ----------
  let isPlaying = false;
  let playToken = 0;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function buildChainArcs(r) {
    const arcs = [];
    for (let i = 0; i < r.length - 1; i++) {
      arcs.push({
        startLat: r[i].lat,
        startLng: r[i].lng,
        endLat: r[i + 1].lat,
        endLng: r[i + 1].lng,
      });
    }
    return arcs;
  }

  function buildHubArcs(r) {
    const hub = r[0];
    return r.slice(1).map((dest) => ({
      startLat: hub.lat,
      startLng: hub.lng,
      endLat: dest.lat,
      endLng: dest.lng,
    }));
  }

  function buildArcs(r) {
    return mode === "hub" ? buildHubArcs(r) : buildChainArcs(r);
  }

  // Great-circle angular separation between two points, in degrees.
  function angularSeparationDeg(lat1, lng1, lat2, lng2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dPhi = toRad(lat2 - lat1);
    const dLambda = toRad(lng2 - lng1);
    const a =
      Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 180) / Math.PI;
  }

  // Altitude that comfortably fits both endpoints of a leg on screen —
  // airports close together (e.g. ZRH/MUC) get a gentler zoom than
  // long-haul pairs, but never uncomfortably close.
  const CLOSE_UP_ALTITUDE = 1.5;
  function fitAltitudeForLeg(arc) {
    const deg = angularSeparationDeg(arc.startLat, arc.startLng, arc.endLat, arc.endLng);
    return Math.min(2.4, Math.max(0.9, deg / 45));
  }

  // brief still pause after each camera move so cuts don't feel abrupt
  const HOLD_MS = 500;

  function cancelPlayback() {
    playToken++;
    isPlaying = false;
    controls.autoRotate = true;
  }

  const durationInput = document.getElementById("durationInput");

  function getLegDurationMs() {
    const seconds = parseFloat(durationInput.value);
    const clamped = Math.min(30, Math.max(3, Number.isFinite(seconds) ? seconds : 12));
    return clamped * 1000;
  }

  async function playRoute(r) {
    if (isPlaying) return;
    isPlaying = true;
    controls.autoRotate = false;
    const token = ++playToken;
    renderRouteList();

    // split the requested per-leg duration across the three camera phases
    const legMs = getLegDurationMs();
    const zoomInMs = Math.round(legMs * 0.3);
    const travelMs = Math.round(legMs * 0.45);
    const zoomOutMs = Math.round(legMs * 0.25);
    world.arcDashAnimateTime(travelMs);

    const arcs = buildArcs(r);
    world.arcsData([]);

    const revealed = [];
    const landed = [];
    for (const arc of arcs) {
      // zoom in close on the departure airport
      world.pointOfView({ lat: arc.startLat, lng: arc.startLng, altitude: CLOSE_UP_ALTITUDE }, zoomInMs);
      await sleep(zoomInMs + HOLD_MS);
      if (token !== playToken) return;

      // "takeoff" pulse, then reveal the arc and pan/zoom to the arrival airport while it draws
      landed.push({ lat: arc.startLat, lng: arc.startLng });
      world.ringsData([...landed]);
      revealed.push(arc);
      world.arcsData([...revealed]);
      world.pointOfView({ lat: arc.endLat, lng: arc.endLng, altitude: CLOSE_UP_ALTITUDE }, travelMs);
      await sleep(travelMs + HOLD_MS);
      if (token !== playToken) return;

      // "landing" pulse at the arrival airport
      landed.push({ lat: arc.endLat, lng: arc.endLng });
      world.ringsData([...landed]);

      // zoom out just enough to show both ends of this leg together
      const midLat = (arc.startLat + arc.endLat) / 2;
      const midLng = (arc.startLng + arc.endLng) / 2;
      world.pointOfView({ lat: midLat, lng: midLng, altitude: fitAltitudeForLeg(arc) }, zoomOutMs);
      await sleep(zoomOutMs + HOLD_MS);
      if (token !== playToken) return;
    }

    // zoom back out to show the whole route, then hold for a calm finishing shot
    const avgLat = r.reduce((s, a) => s + a.lat, 0) / r.length;
    const avgLng = r.reduce((s, a) => s + a.lng, 0) / r.length;
    world.pointOfView({ lat: avgLat, lng: avgLng, altitude: 2.4 }, 2000);
    await sleep(2000 + 1000);

    if (token !== playToken) return;
    isPlaying = false;
    controls.autoRotate = true;
    renderRouteList();
  }

  playBtn.addEventListener("click", () => {
    if (route.length < 2) return;
    playRoute(route);
  });

  // ---------- Recording ----------
  const stopBtn = document.getElementById("stopBtn");
  const recordingSupported =
    typeof window.MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function";

  let recorder = null;
  let chunks = [];

  function setStatus(msg) {
    document.getElementById("statusMsg").textContent = msg || "";
  }

  if (!recordingSupported) {
    recordBtn.disabled = true;
    recordBtn.title = "Recording not supported in this browser (try Chrome or Firefox)";
    setStatus("Recording not supported in this browser — try Chrome or Firefox.");
  }

  function getGlobeCanvas() {
    return document.querySelector("#globeViz canvas");
  }

  function startRecording() {
    const canvas = getGlobeCanvas();
    if (!canvas) {
      setStatus("Globe canvas not found — cannot record.");
      return false;
    }
    const stream = canvas.captureStream(30);
    chunks = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm;codecs=vp8";
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = saveRecording;
    recorder.start();
    return true;
  }

  function stopRecording() {
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function saveRecording() {
    const blob = new Blob(chunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `earthvisualizer-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus("Recording saved and downloaded.");
  }

  recordBtn.addEventListener("click", async () => {
    if (route.length < 2 || isPlaying) return;
    if (!startRecording()) return;

    recordBtn.classList.add("recording");
    recordBtn.textContent = "● Recording…";
    recordBtn.disabled = true;
    playBtn.disabled = true;
    stopBtn.classList.remove("hidden");
    setStatus("Recording in progress…");

    await playRoute(route);
    await sleep(500);
    stopRecording();

    recordBtn.classList.remove("recording");
    recordBtn.textContent = "● Record";
    stopBtn.classList.add("hidden");
    renderRouteList();
  });

  stopBtn.addEventListener("click", () => {
    cancelPlayback();
    stopRecording();
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "● Record";
    stopBtn.classList.add("hidden");
    renderRouteList();
  });

  renderRouteList();
})();
