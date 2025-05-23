/**
 * expand - expands templates with internationalized strings. The resulting HTML files are written to disk.
 *
 * This utility builds the Japanese and English versions of the HTML files. The templates are written using EJS,
 * and roughly follows the methodology described at http://ejohn.org/blog/a-strategy-for-i18n-and-node/
 *
 * English files are placed in the root: public/
 * Japanese files are placed under the language code: public/jp
 * ...and so on for other languages, if ever...
 */

import fs from 'fs/promises';
import path from 'path';
import ejs from 'ejs';
import makeDir from 'make-dir';
import { fileURLToPath } from 'url';
import dictionary from './public/templates/il8n.json' assert { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templateDir = "public/templates";

const templates = [
    "index.html",
    "about.html"
];

const languages = [
    {code: "en", target: "public"},
    {code: "ja", target: "public/jp"}  // *lang* code for Japanese is JA not JP. Too late now. Site already public.
];

function newContext(languageCode) {
    return {
        __: function(s) {
            const entry = dictionary[s];
            if (!entry) {
                console.error("unknown il8n key: " + s);
            }
            return entry && entry[languageCode] || s;
        }
    };
}

async function expandTemplates() {
    try {
        for (const file of templates) {
            const templatePath = path.join(__dirname, templateDir, file);
            const templateContent = await fs.readFile(templatePath, 'utf8');
            
            for (const language of languages) {
                const context = newContext(language.code);
                const result = await ejs.render(templateContent, context, { async: true });

                await makeDir(language.target);
                await fs.writeFile(path.join(language.target, file), result);
                console.log(`Generated ${language.code} version of ${file}`);
            }
        }
        console.log('Template expansion complete!');
    } catch (error) {
        console.error('Error expanding templates:', error);
        process.exit(1);
    }
}

// Run the template expansion
expandTemplates();
