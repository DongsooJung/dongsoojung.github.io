const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ignored = new Set([".git", "node_modules", "quote-maker-app", "patches"]);
const marker = "/assets/site-theme.css";
const injection = [
  '  <link rel="stylesheet" href="/assets/site-theme.css">',
  '  <script src="/assets/site-theme.js"></script>'
].join("\n");

const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name === "index.html" && target !== path.join(root, "index.html")) files.push(target);
  }
};

walk(root);

let changed = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(marker)) continue;
  if (source.includes("/assets/theme-boot.js") || source.includes("data-theme-toggle")) {
    continue;
  }
  if (!source.includes("</head>")) {
    throw new Error(`Missing </head>: ${path.relative(root, file)}`);
  }
  fs.writeFileSync(file, source.replace("</head>", `${injection}\n</head>`), "utf8");
  changed += 1;
}

console.log(`Theme assets added to ${changed} nested pages (${files.length} checked).`);
