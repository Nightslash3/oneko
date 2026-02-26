/**
 * oneko plugin for Vendetta / Revenge Classic
 *
 * Based on oneko.js by adryd325 (https://github.com/adryd325/oneko.js)
 * Vencord plugin by Ven & adryd
 * Adapted for React Native / Vendetta by Nightslash3.
 *
 * The cat follows your finger on the TOP HALF of the screen only,
 * so it never interferes with the keyboard or emoji/image selector.
 *
 * This file is eval'd by Vendetta wrapped as:
 *   vendetta => { return <this code> }
 */
(function () {
    // ---------------------------------------------------------------
    // Config
    // ---------------------------------------------------------------
    var SPRITE_URL =
        "https://raw.githubusercontent.com/adryd325/oneko.js/14bab15a755d0e35cd4ae19c931d96d306f99f42/oneko.gif";
    var SPRITE_SIZE = 32;
    var SHEET_W = SPRITE_SIZE * 8; // 256
    var SHEET_H = SPRITE_SIZE * 4; // 128
    var NEKO_SPEED = 10;

    // ---------------------------------------------------------------
    // Sprite definitions (same as the original oneko.js)
    // Each pair is [col, row] multiplied by SPRITE_SIZE to offset
    // into the sprite-sheet.
    // ---------------------------------------------------------------
    var spriteSets = {
        idle: [[-3, -3]],
        alert: [[-7, -3]],
        scratchSelf: [
            [-5, 0],
            [-6, 0],
            [-7, 0],
        ],
        scratchWallN: [
            [0, 0],
            [0, -1],
        ],
        scratchWallS: [
            [-7, -1],
            [-6, -2],
        ],
        scratchWallE: [
            [-2, -2],
            [-2, -3],
        ],
        scratchWallW: [
            [-4, 0],
            [-4, -1],
        ],
        tired: [[-3, -2]],
        sleeping: [
            [-2, 0],
            [-2, -1],
        ],
        N: [
            [-1, -2],
            [-1, -3],
        ],
        NE: [
            [0, -2],
            [0, -3],
        ],
        E: [
            [-3, 0],
            [-3, -1],
        ],
        SE: [
            [-5, -1],
            [-5, -2],
        ],
        S: [
            [-6, -3],
            [-7, -2],
        ],
        SW: [
            [-5, -3],
            [-6, -1],
        ],
        W: [
            [-4, -2],
            [-4, -3],
        ],
        NW: [
            [-1, 0],
            [-1, -1],
        ],
    };

    // ---------------------------------------------------------------
    // Module references (populated in onLoad)
    // ---------------------------------------------------------------
    var React, RN, Animated, Dimensions;

    // ---------------------------------------------------------------
    // Runtime state
    // ---------------------------------------------------------------
    var patches = [];
    var nekoSlotTaken = false;

    // ---------------------------------------------------------------
    // OnekoOverlay – React Native function component
    //
    // Wraps whatever children it receives, adds touch tracking on
    // the top half of the screen, and renders a cat sprite that
    // chases the last touch position.
    // ---------------------------------------------------------------
    function OnekoOverlay(props) {
        var useState = React.useState;
        var useRef = React.useRef;
        var useEffect = React.useEffect;
        var useCallback = React.useCallback;

        // --- Singleton guard (only one cat at a time) ---
        var masterRef = useRef(null);
        if (masterRef.current === null) {
            if (!nekoSlotTaken) {
                nekoSlotTaken = true;
                masterRef.current = true;
            } else {
                masterRef.current = false;
            }
        }
        var isMaster = masterRef.current;

        // --- Mutable refs (no re-renders) ---
        var nekoPosRef = useRef({ x: 32, y: 32 });
        var touchPosRef = useRef({ x: 32, y: 32 });
        var frameCountRef = useRef(0);
        var idleTimeRef = useRef(0);
        var idleAnimRef = useRef(null);
        var idleAnimFrameRef = useRef(0);

        // --- Animated values (imperatively updated) ---
        var catLeft = useRef(new Animated.Value(16)).current;
        var catTop = useRef(new Animated.Value(16)).current;
        var sheetX = useRef(
            new Animated.Value(spriteSets.idle[0][0] * SPRITE_SIZE)
        ).current;
        var sheetY = useRef(
            new Animated.Value(spriteSets.idle[0][1] * SPRITE_SIZE)
        ).current;

        // --- setSprite: pick a frame from the sprite-sheet ---
        var setSprite = useCallback(
            function (name, frame) {
                var set = spriteSets[name];
                if (!set) return;
                var s = set[frame % set.length];
                sheetX.setValue(s[0] * SPRITE_SIZE);
                sheetY.setValue(s[1] * SPRITE_SIZE);
            },
            [sheetX, sheetY]
        );

        var resetIdleAnim = useCallback(function () {
            idleAnimRef.current = null;
            idleAnimFrameRef.current = 0;
        }, []);

        // --- Idle behaviour (scratch, sleep, etc.) ---
        var idle = useCallback(
            function () {
                idleTimeRef.current += 1;

                if (
                    idleTimeRef.current > 10 &&
                    Math.floor(Math.random() * 200) === 0 &&
                    idleAnimRef.current === null
                ) {
                    var dim = Dimensions.get("window");
                    var maxY = dim.height / 2;
                    var pos = nekoPosRef.current;
                    var avail = ["sleeping", "scratchSelf"];
                    if (pos.x < 32) avail.push("scratchWallW");
                    if (pos.y < 32) avail.push("scratchWallN");
                    if (pos.x > dim.width - 32) avail.push("scratchWallE");
                    if (pos.y > maxY - 32) avail.push("scratchWallS");
                    idleAnimRef.current =
                        avail[Math.floor(Math.random() * avail.length)];
                }

                var anim = idleAnimRef.current;
                var af = idleAnimFrameRef.current;

                switch (anim) {
                    case "sleeping":
                        if (af < 8) {
                            setSprite("tired", 0);
                            break;
                        }
                        setSprite("sleeping", Math.floor(af / 4));
                        if (af > 192) resetIdleAnim();
                        break;
                    case "scratchWallN":
                    case "scratchWallS":
                    case "scratchWallE":
                    case "scratchWallW":
                    case "scratchSelf":
                        setSprite(anim, af);
                        if (af > 9) resetIdleAnim();
                        break;
                    default:
                        setSprite("idle", 0);
                        return;
                }
                idleAnimFrameRef.current += 1;
            },
            [setSprite, resetIdleAnim]
        );

        // --- Per-frame tick (≈10 fps via setInterval) ---
        var tick = useCallback(
            function () {
                var dim = Dimensions.get("window");
                var maxY = dim.height / 2;
                var neko = nekoPosRef.current;
                var touch = touchPosRef.current;

                frameCountRef.current += 1;

                var diffX = neko.x - touch.x;
                var diffY = neko.y - touch.y;
                var distance = Math.sqrt(diffX * diffX + diffY * diffY);

                // Close enough → idle
                if (distance < NEKO_SPEED || distance < 48) {
                    idle();
                    return;
                }

                // Was idle → alert before moving
                idleAnimRef.current = null;
                idleAnimFrameRef.current = 0;

                if (idleTimeRef.current > 1) {
                    setSprite("alert", 0);
                    idleTimeRef.current = Math.min(idleTimeRef.current, 7);
                    idleTimeRef.current -= 1;
                    return;
                }

                // Compass direction
                var dir = "";
                dir += diffY / distance > 0.5 ? "N" : "";
                dir += diffY / distance < -0.5 ? "S" : "";
                dir += diffX / distance > 0.5 ? "W" : "";
                dir += diffX / distance < -0.5 ? "E" : "";
                if (dir) setSprite(dir, frameCountRef.current);

                // Move toward touch
                neko.x -= (diffX / distance) * NEKO_SPEED;
                neko.y -= (diffY / distance) * NEKO_SPEED;

                // Clamp to top half of screen
                neko.x = Math.min(Math.max(16, neko.x), dim.width - 16);
                neko.y = Math.min(Math.max(16, neko.y), maxY - 16);

                catLeft.setValue(neko.x - 16);
                catTop.setValue(neko.y - 16);
            },
            [idle, setSprite, catLeft, catTop]
        );

        // --- Touch handler (only accepts top-half touches) ---
        var handleTouch = useCallback(function (e) {
            var t = e.nativeEvent;
            var screenH = Dimensions.get("window").height;
            if (t.pageY < screenH / 2) {
                touchPosRef.current = { x: t.pageX, y: t.pageY };
            }
        }, []);

        // --- Start / stop the animation timer ---
        useEffect(
            function () {
                if (!isMaster) return;
                var interval = setInterval(tick, 100);
                return function () {
                    clearInterval(interval);
                    nekoSlotTaken = false;
                };
            },
            [isMaster, tick]
        );

        // Non-master instances pass children through unchanged
        if (!isMaster) {
            return props.children || null;
        }

        // ---- Render: wrapper + children + cat overlay ----
        return React.createElement(
            RN.View,
            {
                style: { flex: 1 },
                onTouchStart: handleTouch,
                onTouchMove: handleTouch,
            },
            // Original screen content
            props.children,
            // The cat – absolute-positioned, no touch interaction
            React.createElement(
                Animated.View,
                {
                    pointerEvents: "none",
                    style: {
                        position: "absolute",
                        width: SPRITE_SIZE,
                        height: SPRITE_SIZE,
                        overflow: "hidden",
                        zIndex: 99999,
                        left: catLeft,
                        top: catTop,
                    },
                },
                React.createElement(Animated.Image, {
                    source: { uri: SPRITE_URL },
                    style: {
                        position: "absolute",
                        width: SHEET_W,
                        height: SHEET_H,
                        left: sheetX,
                        top: sheetY,
                    },
                })
            )
        );
    }

    // ---------------------------------------------------------------
    // Wrap helper: creates the after-patch callback that wraps
    // the component return value with OnekoOverlay.
    // Vendetta patcher.after callback signature: (thisObj, args, returnValue)
    // ---------------------------------------------------------------
    function wrapWithOverlay(_this, _args, res) {
        return React.createElement(OnekoOverlay, null, res);
    }

    // ---------------------------------------------------------------
    // Plugin return value – Vendetta format { onLoad, onUnload }
    // ---------------------------------------------------------------
    return {
        onLoad: function () {
            // Grab React & React Native from vendetta metro
            var metro = vendetta.metro;
            var patcher = vendetta.patcher;

            React = metro.common.React;
            RN = metro.common.ReactNative;
            Animated = RN.Animated;
            Dimensions = RN.Dimensions;

            // Pre-fetch the sprite-sheet for instant display
            try { RN.Image.prefetch(SPRITE_URL); } catch (_) {}

            nekoSlotTaken = false;

            var patched = false;

            // --- Strategy 1: Patch ErrorBoundary (class component) ---
            try {
                var EB = metro.findByName("ErrorBoundary");
                if (EB && EB.prototype && EB.prototype.render) {
                    console.log("[oneko] Found ErrorBoundary, patching render");
                    patches.push(
                        patcher.after("render", EB.prototype, wrapWithOverlay)
                    );
                    patched = true;
                }
            } catch (e) {
                console.log("[oneko] ErrorBoundary patch failed:", e);
            }

            // --- Strategy 2: Patch Navigator or AppContainer ---
            if (!patched) {
                var targets = [
                    "ConnectedApp",
                    "App",
                    "RootNavigator",
                    "MainTabsNavigator",
                    "Navigator",
                    "GuildChannel",
                    "ChannelListScreen",
                ];
                for (var i = 0; i < targets.length; i++) {
                    try {
                        var mod = metro.findByName(targets[i], false);
                        if (mod && mod.default) {
                            console.log("[oneko] Found " + targets[i] + ", patching default");
                            patches.push(
                                patcher.after("default", mod, wrapWithOverlay)
                            );
                            patched = true;
                            break;
                        }
                    } catch (_) {}
                }
            }

            // --- Strategy 3: Patch Chat as last resort ---
            if (!patched) {
                try {
                    var Chat = metro.findByName("Chat", false);
                    if (Chat && Chat.default) {
                        console.log("[oneko] Found Chat, patching default");
                        patches.push(
                            patcher.after("default", Chat, wrapWithOverlay)
                        );
                        patched = true;
                    }
                } catch (_) {}
            }

            // --- Strategy 4: findByProps fallback ---
            if (!patched) {
                try {
                    var AppModule = metro.findByProps("AppContainer");
                    if (AppModule && AppModule.AppContainer) {
                        console.log("[oneko] Found AppContainer via findByProps");
                        patches.push(
                            patcher.after("render", AppModule.AppContainer.prototype, wrapWithOverlay)
                        );
                        patched = true;
                    }
                } catch (_) {}
            }

            if (!patched) {
                console.log("[oneko] WARNING: Could not find any component to patch. The cat won't appear.");
            } else {
                console.log("[oneko] Plugin loaded successfully!");
            }
        },

        onUnload: function () {
            patches.forEach(function (unpatch) {
                try { unpatch(); } catch (_) {}
            });
            patches = [];
            nekoSlotTaken = false;
            console.log("[oneko] Plugin unloaded");
        },
    };
})();
