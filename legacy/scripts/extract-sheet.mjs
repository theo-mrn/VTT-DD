#!/usr/bin/env node
import process from 'node:process';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/extract-sheet.mjs <url> [--format json|yaml|txt]');
  process.exit(args.length === 0 ? 1 : 0);
}

const url = args[0];
const format = (args[1] || 'json').replace(/^--format=?/, '').toLowerCase();
const allowedFormats = ['json', 'yaml', 'txt'];
if (!allowedFormats.includes(format)) {
  console.error(`Unsupported format: ${format}. Use one of ${allowedFormats.join(', ')}.`);
  process.exit(1);
}

async function main() {
  const html = await fetchPage(url);
  const tmpObjectSource = extractTmpObject(html);
  const data = parseTmpObject(tmpObjectSource);

  if (format === 'yaml') {
    process.stdout.write(toYaml(data));
  } else if (format === 'txt') {
    process.stdout.write(toTxt(data));
  } else {
    process.stdout.write(JSON.stringify(data, null, 2));
  }
}

async function fetchPage(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

function extractTmpObject(html) {
  const marker = 'var tmp =';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error('Could not find "var tmp =" in page HTML.');
  }

  const startIndex = html.indexOf('{', markerIndex);
  if (startIndex < 0) {
    throw new Error('Could not find opening brace for tmp object.');
  }

  let depth = 0;
  let endIndex = -1;
  for (let i = startIndex; i < html.length; i += 1) {
    const char = html[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }

  if (endIndex < 0) {
    throw new Error('Could not find matching closing brace for tmp object.');
  }

  const objectSource = html.slice(startIndex, endIndex);
  return objectSource;
}

function parseTmpObject(source) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Failed to parse tmp object as JSON: ${error.message}`);
  }
}

function toYaml(value, indent = 0) {
  const prefix = ' '.repeat(indent);
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return value
      .map((item) => `${prefix}- ${formatYamlValue(item, indent + 2)}`)
      .join('\n');
  }
  if (typeof value === 'object') {
    const lines = [];
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return '{}';
    }
    for (const key of keys) {
      const item = value[key];
      if (item === null || typeof item !== 'object') {
        lines.push(`${prefix}${key}: ${formatYamlValue(item, indent + 2)}`);
      } else {
        lines.push(`${prefix}${key}:`);
        lines.push(toYaml(item, indent + 2));
      }
    }
    return lines.join('\n');
  }
  return formatYamlValue(value, indent);
}

function formatYamlValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value === '') return '""';
    if (value.includes('\n') || value.includes(': ') || value.includes('"') || value.includes("'") || value.startsWith(' ') || value.endsWith(' ')) {
      return JSON.stringify(value);
    }
    return value;
  }
  return JSON.stringify(value);
}

function toTxt(value, indent = 0) {
  const prefix = ' '.repeat(indent);
  if (value === null || typeof value !== 'object') {
    return `${prefix}${value}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => `${prefix}- ${typeof item === 'object' ? '\n' + toTxt(item, indent + 2) : item}`).join('\n');
  }
  const lines = [];
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item === null || typeof item !== 'object') {
      lines.push(`${prefix}${key}: ${item}`);
    } else {
      lines.push(`${prefix}${key}:`);
      lines.push(toTxt(item, indent + 2));
    }
  }
  return lines.join('\n');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
