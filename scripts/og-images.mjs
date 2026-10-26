// Generates the static per-track Open Graph images in public/og/. Run: node scripts/og-images.mjs
// Notes-only lessons use these; video lessons use their YouTube thumbnail.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const tracks = {
  default: ['Patil Classes', 'Video lessons and PDF notes, in order'],
  'class-10': ['Class 10', 'Maths and Computer Science'],
  'class-11': ['Class 11', 'Maths and Computer Science'],
  'class-12': ['Class 12', 'Maths and Computer Science'],
  engineering: ['Engineering', 'C, C++, Java and Python'],
  pro: ['Professionals', 'AI, cloud and backend engineering'],
};

await mkdir('public/og', { recursive: true });
for (const [id, [title, blurb]] of Object.entries(tracks)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#1c1b18"/>
    <text x="96" y="120" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#a8a59c" letter-spacing="2">PATIL CLASSES</text>
    <rect x="84" y="268" width="${Math.min(980, 60 + title.length * 62)}" height="96" rx="10" fill="#f2c94c" transform="rotate(-1.5 400 316)"/>
    <text x="96" y="345" font-family="Helvetica, Arial, sans-serif" font-size="104" font-weight="800" fill="#1c1b18">${title}</text>
    <text x="96" y="450" font-family="Helvetica, Arial, sans-serif" font-size="42" fill="#ece9e1">${blurb}</text>
    <text x="96" y="550" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#a8a59c">Watch. Download. Revise. No account needed.</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(`public/og/${id}.png`);
}
console.log('OG images written to public/og/');
