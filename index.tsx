/*
 * Oneko Plugin for Revenge (Discord Android mod)
 *
 * Based on oneko.js by adryd325 (https://github.com/adryd325/oneko.js)
 * Vencord plugin by Ven & adryd (https://github.com/Vendicated/Vencord)
 * Adapted for React Native / Revenge by community contribution.
 *
 * The cat follows your finger on the top half of the screen only,
 * so it doesn't interfere with the keyboard or image/emoji picker.
 *
 * USAGE:
 *   Copy this folder into your Revenge source at:
 *     src/plugins/start/oneko/
 *   Then rebuild Revenge. The plugin will be auto-discovered.
 *
 *   Alternatively, paste the compiled JS into Revenge's
 *   Developer Kit > Evaluate JavaScript.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { waitForModules } from '@revenge-mod/modules/finders'
import { withName } from '@revenge-mod/modules/finders/filters'
import { after } from '@revenge-mod/patcher'
import { InternalPluginFlags, registerPlugin } from '@revenge-mod/plugins/_'
import { PluginFlags } from '@revenge-mod/plugins/constants'
import { React, ReactNative } from '@revenge-mod/react'

// ---------------------------------------------------------------------------
// React / React Native destructuring
// ---------------------------------------------------------------------------

const { View, Image, Animated, Dimensions, StyleSheet } = ReactNative
const { useState, useEffect, useRef, useCallback } = React

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** URL of the oneko sprite-sheet (static GIF, 8×4 grid of 32×32 sprites). */
const ONEKO_GIF_URL =
    'https://raw.githubusercontent.com/adryd325/oneko.js/14bab15a755d0e35cd4ae19c931d96d306f99f42/oneko.gif'

const SPRITE_SIZE = 32
const SHEET_WIDTH = SPRITE_SIZE * 8 // 256
const SHEET_HEIGHT = SPRITE_SIZE * 4 // 128
const NEKO_SPEED = 10

// ---------------------------------------------------------------------------
// Sprite definitions (identical to the original oneko.js)
// Each value pair [col, row] is multiplied by SPRITE_SIZE to get the pixel
// offset into the sprite-sheet.
// ---------------------------------------------------------------------------

const spriteSets: Record<string, [number, number][]> = {
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
}

// ---------------------------------------------------------------------------
// Singleton guard – ensures only one cat is rendered even if the wrapper
// component is mounted in multiple ErrorBoundary instances.
// ---------------------------------------------------------------------------

let nekoSlotTaken = false

// ---------------------------------------------------------------------------
// OnekoOverlay – the React Native component that wraps the app content,
// listens for touches on the TOP HALF of the screen, and renders the cat.
// ---------------------------------------------------------------------------

function OnekoOverlay({ children }: { children: React.ReactNode }) {
    // ---- singleton claim (synchronous, runs during first render) ----
    const [isMaster] = useState(() => {
        if (!nekoSlotTaken) {
            nekoSlotTaken = true
            return true
        }
        return false
    })

    // ---- mutable refs (no re-renders on update) ----
    const nekoPosRef = useRef({ x: 32, y: 32 })
    const touchPosRef = useRef({ x: 32, y: 32 })
    const frameCountRef = useRef(0)
    const idleTimeRef = useRef(0)
    const idleAnimRef = useRef<string | null>(null)
    const idleAnimFrameRef = useRef(0)

    // ---- Animated values (updated imperatively, no re-renders) ----
    const catLeft = useRef(new Animated.Value(16)).current
    const catTop = useRef(new Animated.Value(16)).current
    const sheetOffsetX = useRef(
        new Animated.Value(spriteSets.idle[0][0] * SPRITE_SIZE),
    ).current
    const sheetOffsetY = useRef(
        new Animated.Value(spriteSets.idle[0][1] * SPRITE_SIZE),
    ).current

    // ---- helper: set the visible sprite frame ----
    const setSprite = useCallback(
        (name: string, frame: number) => {
            const set = spriteSets[name]
            if (!set) return
            const sprite = set[frame % set.length]
            sheetOffsetX.setValue(sprite[0] * SPRITE_SIZE)
            sheetOffsetY.setValue(sprite[1] * SPRITE_SIZE)
        },
        [sheetOffsetX, sheetOffsetY],
    )

    const resetIdleAnimation = useCallback(() => {
        idleAnimRef.current = null
        idleAnimFrameRef.current = 0
    }, [])

    // ---- idle behaviour (scratch, sleep, etc.) ----
    const idle = useCallback(() => {
        idleTimeRef.current += 1

        // Randomly pick an idle animation every ~20 s
        if (
            idleTimeRef.current > 10 &&
            Math.floor(Math.random() * 200) === 0 &&
            idleAnimRef.current === null
        ) {
            const { width, height } = Dimensions.get('window')
            const maxY = height / 2
            const pos = nekoPosRef.current
            const available: string[] = ['sleeping', 'scratchSelf']

            if (pos.x < 32) available.push('scratchWallW')
            if (pos.y < 32) available.push('scratchWallN')
            if (pos.x > width - 32) available.push('scratchWallE')
            if (pos.y > maxY - 32) available.push('scratchWallS')

            idleAnimRef.current =
                available[Math.floor(Math.random() * available.length)]
        }

        const anim = idleAnimRef.current
        const af = idleAnimFrameRef.current

        switch (anim) {
            case 'sleeping':
                if (af < 8) {
                    setSprite('tired', 0)
                    break
                }
                setSprite('sleeping', Math.floor(af / 4))
                if (af > 192) resetIdleAnimation()
                break
            case 'scratchWallN':
            case 'scratchWallS':
            case 'scratchWallE':
            case 'scratchWallW':
            case 'scratchSelf':
                setSprite(anim, af)
                if (af > 9) resetIdleAnimation()
                break
            default:
                setSprite('idle', 0)
                return
        }
        idleAnimFrameRef.current += 1
    }, [setSprite, resetIdleAnimation])

    // ---- per-frame update (runs every 100 ms ≈ 10 fps) ----
    const tick = useCallback(() => {
        const { width, height } = Dimensions.get('window')
        const maxY = height / 2

        const neko = nekoPosRef.current
        const touch = touchPosRef.current

        frameCountRef.current += 1

        const diffX = neko.x - touch.x
        const diffY = neko.y - touch.y
        const distance = Math.sqrt(diffX ** 2 + diffY ** 2)

        // Close enough → idle
        if (distance < NEKO_SPEED || distance < 48) {
            idle()
            return
        }

        // Was idle → play alert before moving
        idleAnimRef.current = null
        idleAnimFrameRef.current = 0

        if (idleTimeRef.current > 1) {
            setSprite('alert', 0)
            idleTimeRef.current = Math.min(idleTimeRef.current, 7)
            idleTimeRef.current -= 1
            return
        }

        // Determine compass direction
        let direction = ''
        direction += diffY / distance > 0.5 ? 'N' : ''
        direction += diffY / distance < -0.5 ? 'S' : ''
        direction += diffX / distance > 0.5 ? 'W' : ''
        direction += diffX / distance < -0.5 ? 'E' : ''
        if (direction) setSprite(direction, frameCountRef.current)

        // Move toward touch position
        neko.x -= (diffX / distance) * NEKO_SPEED
        neko.y -= (diffY / distance) * NEKO_SPEED

        // Clamp to visible area (top half of screen only)
        neko.x = Math.min(Math.max(16, neko.x), width - 16)
        neko.y = Math.min(Math.max(16, neko.y), maxY - 16)

        catLeft.setValue(neko.x - 16)
        catTop.setValue(neko.y - 16)
    }, [idle, setSprite, catLeft, catTop])

    // ---- touch handler: only accepts touches on the top half ----
    const handleTouch = useCallback(
        (e: any) => {
            const { pageX, pageY } = e.nativeEvent
            const { height } = Dimensions.get('window')
            if (pageY < height / 2) {
                touchPosRef.current = { x: pageX, y: pageY }
            }
        },
        [],
    )

    // ---- start / stop the animation timer ----
    useEffect(() => {
        if (!isMaster) return

        const interval = setInterval(tick, 100)
        return () => {
            clearInterval(interval)
            nekoSlotTaken = false
        }
    }, [isMaster, tick])

    // ---- If this instance isn't the master, just pass children through ----
    if (!isMaster) {
        return <>{children}</>
    }

    // ---- Render: wrapper (touch tracking) + children + cat overlay ----
    return (
        <View
            style={styles.wrapper}
            onTouchStart={handleTouch}
            onTouchMove={handleTouch}
        >
            {children}

            {/* The cat – absolute-positioned, pointer-events disabled */}
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.catContainer,
                    { left: catLeft, top: catTop },
                ]}
            >
                <Animated.Image
                    source={{ uri: ONEKO_GIF_URL }}
                    style={[
                        styles.spriteSheet,
                        {
                            left: sheetOffsetX,
                            top: sheetOffsetY,
                        },
                    ]}
                />
            </Animated.View>
        </View>
    )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
    },
    catContainer: {
        position: 'absolute',
        width: SPRITE_SIZE,
        height: SPRITE_SIZE,
        overflow: 'hidden',
        zIndex: 99999,
    },
    spriteSheet: {
        position: 'absolute',
        width: SHEET_WIDTH,
        height: SHEET_HEIGHT,
    },
})

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

registerPlugin(
    {
        id: 'oneko',
        name: 'oneko',
        description:
            'Cat follows your finger! Only responds to touches on the top half of the screen.',
        author: 'adryd325 & Ven (original), adapted for Revenge',
        icon: 'PawIcon',
    },
    {
        start({ cleanup }) {
            // Reset singleton in case of hot-reload
            nekoSlotTaken = false

            // Pre-fetch the sprite-sheet so the cat appears instantly
            Image.prefetch(ONEKO_GIF_URL)

            // Find the root ErrorBoundary and wrap its output with OnekoOverlay
            const unsub = waitForModules(
                withName<typeof ErrorBoundaryType>('ErrorBoundary'),
                exports => {
                    unsub()

                    const unpatch = after(
                        exports.prototype,
                        'render',
                        (result: React.ReactNode) => {
                            return (
                                <OnekoOverlay>{result}</OnekoOverlay>
                            )
                        },
                    )

                    cleanup(unpatch)
                },
                { cached: true },
            )

            cleanup(unsub)
        },

        stop() {
            nekoSlotTaken = false
        },
    },
    PluginFlags.Enabled,
    0, // no internal flags – this is a community plugin
)

// Type helper for the ErrorBoundary module lookup (not exported)
declare class ErrorBoundaryType {
    render(): React.ReactNode
}
