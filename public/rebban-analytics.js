(function () {
  var script = document.currentScript;
  var endpoint =
    (script && script.getAttribute("data-endpoint")) ||
    "https://app.rebban.com/api/analytics/collect";

  function skip(path) {
    return (
      path.indexOf("/api/") === 0 ||
      path.indexOf("/admin") === 0 ||
      path.indexOf("/_next/") === 0
    );
  }

  function send() {
    var hostname = location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
      return;
    }
    var path = location.pathname || "/";
    if (skip(path)) return;
    var payload = JSON.stringify({
      path: path,
      title: document.title || "",
      referrer: document.referrer || "",
      host: location.host || "",
    });
    var sameOrigin = endpoint.indexOf(location.origin) === 0;
    try {
      if (sameOrigin && navigator.sendBeacon) {
        var blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }
    } catch (e) {
      /* fall through */
    }
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      credentials: "include",
      keepalive: true,
      mode: "cors",
    }).catch(function () {});
  }

  send();

  var last = location.pathname;
  var push = history.pushState;
  history.pushState = function () {
    var result = push.apply(this, arguments);
    if (location.pathname !== last) {
      last = location.pathname;
      send();
    }
    return result;
  };
  window.addEventListener("popstate", function () {
    if (location.pathname !== last) {
      last = location.pathname;
      send();
    }
  });
})();
