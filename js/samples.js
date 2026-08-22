import { makeCanvas } from "./image.js";

export function drawSample(label, seed) {
  const c = makeCanvas(224, 224);
  const ctx = c.getContext("2d");
  const rnd = mulberry(seed + (label === "cat" ? 17 : 91));
  ctx.fillStyle = "#f3ede0";
  ctx.fillRect(0, 0, 224, 224);
  ctx.fillStyle = "#e4d8c4";
  for (let i = 0; i < 18; i++) ctx.fillRect(8 + rnd() * 208, 8 + rnd() * 208, 2, 2);
  if (label === "cat") drawCat(ctx, rnd);
  else drawHouse(ctx, rnd);
  return c;
}

function mulberry(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawCat(ctx, rnd) {
  const ink = rnd() > 0.5 ? "#1a1b3a" : "#2c2f62";
  const fill = rnd() > 0.5 ? "#e8954a" : "#d9b48a";
  const ox = 20 + rnd() * 16;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  ctx.fillStyle = fill;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.arc(92 + ox, 118, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(50 + ox, 80);
  ctx.lineTo(58 + ox, 38);
  ctx.lineTo(84 + ox, 72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(134 + ox, 80);
  ctx.lineTo(142 + ox, 36 + rnd() * 8);
  ctx.lineTo(108 + ox, 74);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(70 + ox, 112, 6, 0, Math.PI * 2);
  ctx.arc(108 + ox, 112, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(88 + ox, 124);
  ctx.lineTo(94 + ox, 132);
  ctx.lineTo(82 + ox, 132);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, 128);
  ctx.lineTo(40, 120 + rnd() * 16);
  ctx.moveTo(70, 136);
  ctx.lineTo(42, 144);
  ctx.moveTo(150, 128);
  ctx.lineTo(184, 118 + rnd() * 16);
  ctx.moveTo(150, 136);
  ctx.lineTo(182, 146);
  ctx.stroke();
}

function drawHouse(ctx, rnd) {
  const ink = "#1a1b3a";
  const wall = rnd() > 0.5 ? "#d4544a" : "#c46b58";
  const roof = rnd() > 0.5 ? "#2c2f62" : "#16183a";
  const ox = 8 + rnd() * 18;
  const oy = 10 + rnd() * 14;
  ctx.lineJoin = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = ink;
  ctx.fillStyle = wall;
  ctx.beginPath();
  ctx.rect(48 + ox, 110 + oy, 120, 80);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(40 + ox, 114 + oy);
  ctx.lineTo(108 + ox, 48 + oy);
  ctx.lineTo(176 + ox, 114 + oy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e8c04a";
  ctx.fillRect(92 + ox, 142 + oy, 28, 48);
  ctx.strokeRect(92 + ox, 142 + oy, 28, 48);
  ctx.fillStyle = "#f3ede0";
  ctx.fillRect(60 + ox, 126 + oy, 22, 22);
  ctx.strokeRect(60 + ox, 126 + oy, 22, 22);
  ctx.fillRect(132 + ox, 126 + oy, 22, 22);
  ctx.strokeRect(132 + ox, 126 + oy, 22, 22);
}
