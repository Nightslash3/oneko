/**
 * oneko plugin for Vendetta / Revenge Classic
 *
 * Based on oneko.js by adryd325 (https://github.com/adryd325/oneko.js)
 * Adapted for React Native / Vendetta by Nightslash3.
 *
 * Cat follows your finger on the TOP HALF of the screen only.
 */
(function () {
    var SPRITE_URL =
        "https://raw.githubusercontent.com/adryd325/oneko.js/14bab15a755d0e35cd4ae19c931d96d306f99f42/oneko.gif";
    var SPRITE_SIZE = 32;
    var SHEET_W = SPRITE_SIZE * 8;
    var SHEET_H = SPRITE_SIZE * 4;
    var NEKO_SPEED = 10;

    var spriteSets = {
        idle: [[-3, -3]],
        alert: [[-7, -3]],
        scratchSelf: [[-5, 0], [-6, 0], [-7, 0]],
        scratchWallN: [[0, 0], [0, -1]],
        scratchWallS: [[-7, -1], [-6, -2]],
        scratchWallE: [[-2, -2], [-2, -3]],
        scratchWallW: [[-4, 0], [-4, -1]],
        tired: [[-3, -2]],
        sleeping: [[-2, 0], [-2, -1]],
        N: [[-1, -2], [-1, -3]],
        NE: [[0, -2], [0, -3]],
        E: [[-3, 0], [-3, -1]],
        SE: [[-5, -1], [-5, -2]],
        S: [[-6, -3], [-7, -2]],
        SW: [[-5, -3], [-6, -1]],
        W: [[-4, -2], [-4, -3]],
        NW: [[-1, 0], [-1, -1]],
    };

    var React, RN, View, Dimensions, ImageComp;
    var patches = [];
    var tickInterval = null;

    // Global mutable state (avoids complex hooks)
    var nekoX = 32, nekoY = 32;
    var touchX = 32, touchY = 32;
    var frameCount = 0, idleTime = 0;
    var idleAnim = null, idleAnimFrame = 0;
    var spriteCol = -3, spriteRow = -3;
    var forceUpdate = null;

    function setSprite(name, frame) {
        var set = spriteSets[name];
        if (!set) return;
        var s = set[frame % set.length];
        spriteCol = s[0];
        spriteRow = s[1];
    }

    function resetIdle() { idleAnim = null; idleAnimFrame = 0; }

    function idle() {
        idleTime += 1;
        if (idleTime > 10 && Math.floor(Math.random() * 200) === 0 && idleAnim === null) {
            var dim = Dimensions.get("window");
            var maxY = dim.height / 2;
            var avail = ["sleeping", "scratchSelf"];
            if (nekoX < 32) avail.push("scratchWallW");
            if (nekoY < 32) avail.push("scratchWallN");
            if (nekoX > dim.width - 32) avail.push("scratchWallE");
            if (nekoY > maxY - 32) avail.push("scratchWallS");
            idleAnim = avail[Math.floor(Math.random() * avail.length)];
        }
        var af = idleAnimFrame;
        switch (idleAnim) {
            case "sleeping":
                if (af < 8) { setSprite("tired", 0); break; }
                setSprite("sleeping", Math.floor(af / 4));
                if (af > 192) resetIdle();
                break;
            case "scratchWallN": case "scratchWallS":
            case "scratchWallE": case "scratchWallW":
            case "scratchSelf":
                setSprite(idleAnim, af);
                if (af > 9) resetIdle();
                break;
            default:
                setSprite("idle", 0); return;
        }
        idleAnimFrame += 1;
    }

    function tick() {
        var dim = Dimensions.get("window");
        var maxY = dim.height / 2;
        frameCount += 1;
        var diffX = nekoX - touchX;
        var diffY = nekoY - touchY;
        var dist = Math.sqrt(diffX * diffX + diffY * diffY);

        if (dist < NEKO_SPEED || dist < 48) { idle(); triggerUpdate(); return; }

        idleAnim = null; idleAnimFrame = 0;
        if (idleTime > 1) {
            setSprite("alert", 0);
            idleTime = Math.min(idleTime, 7); idleTime -= 1;
            triggerUpdate(); return;
        }

        var dir = "";
        dir += diffY / dist > 0.5 ? "N" : "";
        dir += diffY / dist < -0.5 ? "S" : "";
        dir += diffX / dist > 0.5 ? "W" : "";
        dir += diffX / dist < -0.5 ? "E" : "";
        if (dir) setSprite(dir, frameCount);

        nekoX -= (diffX / dist) * NEKO_SPEED;
        nekoY -= (diffY / dist) * NEKO_SPEED;
        nekoX = Math.min(Math.max(16, nekoX), dim.width - 16);
        nekoY = Math.min(Math.max(16, nekoY), maxY - 16);
        triggerUpdate();
    }

    function triggerUpdate() { if (forceUpdate) forceUpdate(Date.now()); }

    // ---------------------------------------------------------------
    // Cat overlay component – plain Views, no Animated
    // ---------------------------------------------------------------
    function NekoCat() {
        var state = React.useState(0);
        forceUpdate = state[1];

        var handleTouch = React.useCallback(function (e) {
            var t = e.nativeEvent;
            var h = Dimensions.get("window").height;
            if (t.pageY < h / 2) { touchX = t.pageX; touchY = t.pageY; }
        }, []);

        React.useEffect(function () {
            return function () { forceUpdate = null; };
        }, []);

        return React.createElement(
            View,
            {
                style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, elevation: 99999 },
                pointerEvents: "box-none",
                onTouchStart: handleTouch,
                onTouchMove: handleTouch,
            },
            // Sprite clipping container
            React.createElement(
                View,
                {
                    pointerEvents: "none",
                    style: {
                        position: "absolute",
                        left: nekoX - 16,
                        top: nekoY - 16,
                        width: SPRITE_SIZE,
                        height: SPRITE_SIZE,
                        overflow: "hidden",
                    },
                },
                React.createElement(ImageComp, {
                    source: { uri: SPRITE_URL },
                    style: {
                        position: "absolute",
                        width: SHEET_W,
                        height: SHEET_H,
                        left: spriteCol * SPRITE_SIZE,
                        top: spriteRow * SPRITE_SIZE,
                    },
                    resizeMode: "stretch",
                })
            )
        );
    }

    // ---------------------------------------------------------------
    // After-patch handler: appends NekoCat to whatever was rendered
    // Handles both (this, args, ret) and (args, ret) signatures
    // ---------------------------------------------------------------
    function afterCb() {
        var ret = arguments[arguments.length - 1];
        if (!ret || typeof ret !== "object") return ret;
        return React.createElement(View, { style: { flex: 1 } }, ret, React.createElement(NekoCat, null));
    }

    function toast(msg) {
        try { vendetta.ui.toasts.showToast(msg, vendetta.assets.getAssetIDByName("Check")); } catch (e) {}
    }

    function doPatch(obj, method, label) {
        try {
            if (!obj || typeof obj[method] !== "function") return false;
            patches.push(vendetta.patcher.after(method, obj, afterCb));
            toast("oneko: patched " + label);
            return true;
        } catch (e) { return false; }
    }

    // ---------------------------------------------------------------
    // Plugin entry
    // ---------------------------------------------------------------
    return {
        onLoad: function () {
            var metro = vendetta.metro;
            React = metro.common.React;
            RN = metro.common.ReactNative;
            View = RN.View;
            Dimensions = RN.Dimensions;
            ImageComp = RN.Image;

            try { ImageComp.prefetch(SPRITE_URL); } catch (e) {}
            toast("oneko: starting...");

            var patched = false;

            // ---- Strategy 1: findByName (class components with .render) ----
            var classNames = ["ErrorBoundary", "App", "ConnectedApp", "AppContainer"];
            for (var i = 0; i < classNames.length && !patched; i++) {
                try {
                    var C = metro.findByName(classNames[i]);
                    if (C && C.prototype && typeof C.prototype.render === "function")
                        patched = doPatch(C.prototype, "render", classNames[i] + ".render");
                } catch (e) {}
            }

            // ---- Strategy 2: findByName (function components as .default) ----
            var funcNames = [
                "Chat", "MessagesWrapper", "RootNavigator", "MainTabsNavigator",
                "Navigator", "HomeScreen", "ChannelScreen", "GuildChannel",
                "ChannelListScreen", "Main",
            ];
            for (var i = 0; i < funcNames.length && !patched; i++) {
                try {
                    var M = metro.findByName(funcNames[i], false);
                    if (M && M.default && typeof M.default === "function")
                        patched = doPatch(M, "default", funcNames[i] + ".default");
                } catch (e) {}
            }

            // ---- Strategy 3: findByDisplayName if available ----
            if (!patched && typeof metro.findByDisplayName === "function") {
                var dnNames = ["ErrorBoundary", "App", "Chat", "Navigator"];
                for (var i = 0; i < dnNames.length && !patched; i++) {
                    try {
                        var C = metro.findByDisplayName(dnNames[i]);
                        if (C && C.prototype && typeof C.prototype.render === "function")
                            patched = doPatch(C.prototype, "render", dnNames[i] + ".dn");
                    } catch (e) {}
                    if (!patched) {
                        try {
                            var M = metro.findByDisplayName(dnNames[i], false);
                            if (M && M.default && typeof M.default === "function")
                                patched = doPatch(M, "default", dnNames[i] + ".dn.d");
                        } catch (e) {}
                    }
                }
            }

            // ---- Strategy 4: findByProps ----
            if (!patched) {
                var propSets = [
                    ["MessagesWrapper"], ["Chat"], ["renderNavigator"],
                    ["AppContainer"], ["Navigator"],
                ];
                for (var i = 0; i < propSets.length && !patched; i++) {
                    try {
                        var M = metro.findByProps.apply(null, propSets[i]);
                        if (M) {
                            var key = propSets[i][0];
                            if (typeof M[key] === "function") {
                                if (M[key].prototype && typeof M[key].prototype.render === "function")
                                    patched = doPatch(M[key].prototype, "render", key + ".fp.r");
                                else
                                    patched = doPatch(M, key, key + ".fp");
                            }
                        }
                    } catch (e) {}
                }
            }

            // ---- Strategy 5: Nuclear — intercept React.createElement ----
            if (!patched) {
                toast("oneko: scanning via createElement...");
                var origCE = React.createElement;
                var ceFound = false;

                React.createElement = function (type) {
                    var result = origCE.apply(React, arguments);
                    if (ceFound) return result;

                    if (type && typeof type === "function" && type.name && type.name.length > 2) {
                        if (/app|main|root|home|screen|chat|channel|navigator/i.test(type.name)) {
                            ceFound = true;
                            React.createElement = origCE;

                            if (type.prototype && typeof type.prototype.render === "function") {
                                doPatch(type.prototype, "render", type.name + ".ce");
                            }

                            return origCE(View, { style: { flex: 1 } }, result, origCE(NekoCat, null));
                        }
                    }
                    return result;
                };

                patches.push(function () {
                    if (!ceFound) React.createElement = origCE;
                });
            }

            // Start animation timer regardless of patch success
            tickInterval = setInterval(tick, 100);
            patches.push(function () {
                if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
            });

            if (patched) toast("oneko: cat active!");
        },

        onUnload: function () {
            for (var i = 0; i < patches.length; i++) {
                try { patches[i](); } catch (e) {}
            }
            patches = [];
            forceUpdate = null;
            tickInterval = null;
        },
    };
})();
