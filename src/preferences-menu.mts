/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * The model of the `Preferences` submenu of the preview context menu: one
 * option per content width, content direction, and theme. Pure: it has no
 * `vscode` dependency, so the manifest, the command registration, and the
 * context values the preview page carries are all derived from, and tested
 * against, this single table.
 *
 * A menu entry cannot show a check mark by itself, so every option has two
 * commands that run the same action: a plain one and one whose title ends
 * with a check mark. The page carries the effective value of each preference
 * as a context value, and the `when` clauses show exactly one of the two.
 */

/** The per-file preference an option stores. */
export type PreferenceKey = 'contentDirection' | 'contentWidth' | 'colorMode';

/** The three groups of the submenu, in display order. */
export type PreferenceGroup = 'width' | 'direction' | 'theme';

/** The id of the submenu, as declared in `contributes.submenus`. */
export const preferencesSubmenuId = 'markdown-preview-gh.preferences';

/** The label of the submenu. */
export const preferencesSubmenuLabel = 'Preferences';

/** The mark that ends the title of the option in effect. */
export const checkMark = '\u2714';

/** One selectable option of the submenu. */
export interface PreferenceOption {
    /** The per-file preference this option stores. */
    readonly key: PreferenceKey;
    /** The submenu group the option belongs to. */
    readonly group: PreferenceGroup;
    /** The value stored when the option is chosen. */
    readonly value: string;
    /** The context value the page carries for this preference. */
    readonly contextKey: string;
    /** The title shown when the option is not in effect. */
    readonly label: string;
    /** The title shown when the option is in effect. */
    readonly checkedLabel: string;
    /** The command that stores the option. */
    readonly command: string;
    /** The command shown instead of `command` while the option is in effect. */
    readonly checkedCommand: string;
    /** The `when` clause that shows `command`. */
    readonly whenUnchecked: string;
    /** The `when` clause that shows `checkedCommand`. */
    readonly whenChecked: string;
    /** The menu group (with its order inside the group) of both commands. */
    readonly menuGroup: string;
}

interface GroupDefinition {
    readonly group: PreferenceGroup;
    readonly key: PreferenceKey;
    readonly contextKey: string;
    readonly title: string;
    readonly values: readonly (readonly [value: string, text: string])[];
}

const groupDefinitions: readonly GroupDefinition[] = [
    {
        group: 'width',
        key: 'contentWidth',
        contextKey: 'mpghWidth',
        title: 'Width',
        values: [
            ['narrow', 'Narrow'],
            ['normal', 'Normal'],
            ['wide', 'Wide'],
            ['full', 'Full'],
        ],
    },
    {
        group: 'direction',
        key: 'contentDirection',
        contextKey: 'mpghDirection',
        title: 'Direction',
        values: [
            ['auto', 'Auto'],
            ['ltr', 'LTR'],
            ['rtl', 'RTL'],
        ],
    },
    {
        group: 'theme',
        key: 'colorMode',
        contextKey: 'mpghTheme',
        title: 'Theme',
        values: [
            ['auto', 'Auto'],
            ['dark', 'Dark'],
            ['light', 'Light'],
        ],
    },
];

/** Every option of the submenu, in display order. */
export const preferenceOptions: readonly PreferenceOption[] = groupDefinitions.flatMap((definition, groupIndex) =>
    definition.values.map(([value, text], valueIndex): PreferenceOption => {
        const label = `${definition.title} ${text}`;
        const command = `${preferencesSubmenuId}.${definition.group}.${value}`;
        return {
            key: definition.key,
            group: definition.group,
            value,
            contextKey: definition.contextKey,
            label,
            checkedLabel: `${label} ${checkMark}`,
            command,
            checkedCommand: `${command}.checked`,
            whenUnchecked: `${definition.contextKey} != '${value}'`,
            whenChecked: `${definition.contextKey} == '${value}'`,
            menuGroup: `${groupIndex + 1}_${definition.group}@${valueIndex + 1}`,
        };
    })
);

/** The effective preferences of a document, as the render wrapper knows them. */
export interface EffectivePreferences {
    /** Content direction: `ltr`, `rtl`, or `auto`. */
    direction: string;
    /** Content width preset: `narrow`, `normal`, `wide`, or `full`. */
    width: string;
    /** Resolved theme mode: `auto`, `dark`, or `light`. */
    themeMode: string;
}

/**
 * Builds the context values the preview page carries so the submenu can tell
 * which option is in effect.
 */
export function buildPreferenceContext(preferences: EffectivePreferences): Record<string, string> {
    const valueByGroup: Record<PreferenceGroup, string> = {
        width: preferences.width,
        direction: preferences.direction,
        theme: preferences.themeMode,
    };
    return Object.fromEntries(groupDefinitions.map((definition) => [definition.contextKey, valueByGroup[definition.group]]));
}
