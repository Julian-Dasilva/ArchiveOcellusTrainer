/// <reference types="vitest/globals" />
import "./jsdomCanvas";
import { Viewport } from "osrs-sdk";

// jsdom has no WebGL for the trainer's 3D viewport, so tests mount the SDK's canvas viewport in its place.
const setupViewport = Viewport.setupViewport;
Viewport.setupViewport = (region, canvas, resizeTarget) => setupViewport(region, canvas, resizeTarget, true);
