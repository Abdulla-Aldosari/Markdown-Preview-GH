/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Offline theme build.
 *
 * Reads the committed palettes and base stylesheet and writes the final
 * preview stylesheets into `dist/`. Deterministic: the same committed
 * snapshot always produces byte-identical output, and no network access is
 * performed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { composeBaseStylesheet, composeThemeStylesheet, type VariablePair } from './theme-compose.mts';
import { THEME_NAMES, validatePalettes } from './theme-extract.mts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The shape of a committed palette JSON file. */
interface PaletteFile {
    colorScheme?: string;
    variables: Record<string, string>;
}

function readPalette(filePath: string): PaletteFile {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Reads a palette JSON file and returns its variables as ordered pairs.
 */
function readVariables(filePath: string): VariablePair[] {
    return Object.entries(readPalette(filePath).variables);
}

/**
 * Generates all preview stylesheets.
 */
export function generateThemeCss({
    buildDir = path.join(__dirname, '..', 'build'),
    distDir = path.join(__dirname, '..', 'dist'),
}: { buildDir?: string; distDir?: string } = {}): void {
    const palettesDir = path.join(buildDir, 'palettes');
    const sharedPairs = readVariables(path.join(palettesDir, 'shared.json'));
    const palettes = new Map<string, Map<string, string>>();
    const colorSchemes = new Map<string, string>();
    for (const name of THEME_NAMES) {
        const palette = readPalette(path.join(palettesDir, `${name}.json`));
        palettes.set(name, new Map(Object.entries(palette.variables)));
        if (palette.colorScheme) {
            colorSchemes.set(name, palette.colorScheme);
        }
    }
    const baseStyles = fs.readFileSync(path.join(buildDir, 'base-styles.css'), 'utf8');
    validatePalettes(new Map(sharedPairs), palettes, baseStyles);

    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(path.join(distDir, 'preview-base.css'), composeBaseStylesheet(baseStyles));
    for (const name of THEME_NAMES) {
        const colorScheme = colorSchemes.get(name);
        const themePairs = palettes.get(name);
        if (!colorScheme || !themePairs) {
            throw new Error(`Missing palette data for theme "${name}"`);
        }
        const css = composeThemeStylesheet({
            themeName: name,
            colorScheme,
            sharedPairs,
            themePairs: [...themePairs],
        });
        fs.writeFileSync(path.join(distDir, `theme-${name.replace(/_/g, '-')}.css`), css);
    }
    console.log(`Generated ${THEME_NAMES.length} theme stylesheets and preview-base.css`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    generateThemeCss();
}
