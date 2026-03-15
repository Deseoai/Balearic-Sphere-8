#!/usr/bin/env node
/**
 * Generates placeholder PNG assets for the Balea Sphere mobile app.
 * Run this once to create icon.png, splash.png, and notification-icon.png.
 *
 * Usage:
 *   node scripts/generate-assets.js
 *
 * Replace the generated files with your final design assets before
 * submitting to the App Store.
 *
 * Requires: npm install canvas (run once)
 */

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const assetsDir = path.join(__dirname, "../apps/mobile/assets");
fs.mkdirSync(assetsDir, { recursive: true });

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0C0B09";
  ctx.fillRect(0, 0, size, size);

  // Gold circle
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const gradient = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.1, cx, cy, r);
  gradient.addColorStop(0, "#D4A84A");
  gradient.addColorStop(1, "#C4973A");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // ✦ symbol
  ctx.fillStyle = "#0C0B09";
  ctx.font = `bold ${Math.floor(size * 0.38)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✦", cx, cy + size * 0.02);

  return canvas;
}

function drawSplash(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0C0B09";
  ctx.fillRect(0, 0, w, h);

  // Center mark
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.12;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.5, r, 0, Math.PI * 2);
  ctx.fillStyle = "#C4973A";
  ctx.fill();

  ctx.fillStyle = "#0C0B09";
  ctx.font = `bold ${Math.floor(r * 1.3)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✦", cx, cy - r * 0.5 + r * 0.04);

  ctx.fillStyle = "#E8D5A8";
  ctx.font = `${Math.floor(r * 0.7)}px serif`;
  ctx.fillText("BALEA SPHERE", cx, cy + r * 0.8);

  return canvas;
}

function drawNotificationIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#C4973A";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "#0C0B09";
  ctx.font = `bold ${Math.floor(size * 0.55)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("✦", size / 2, size / 2 + size * 0.03);

  return canvas;
}

function save(canvas, name) {
  const file = path.join(assetsDir, name);
  const buf = canvas.toBuffer("image/png");
  fs.writeFileSync(file, buf);
  console.log(`✓ ${name} (${canvas.width}x${canvas.height})`);
}

console.log("Generating Balea Sphere mobile assets...\n");

save(drawIcon(1024), "icon.png");
save(drawSplash(1284, 2778), "splash.png");         // iPhone 13 Pro Max
save(drawNotificationIcon(96), "notification-icon.png");

console.log("\nDone. Assets saved to apps/mobile/assets/");
console.log("Replace with final design assets before App Store submission.");
