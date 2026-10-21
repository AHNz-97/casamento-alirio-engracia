import {readFile,writeFile} from 'node:fs/promises';
import template from '../lib/guest-template.js';
const descriptions=['Alírio e Engrácia abraçados numa fotografia de estúdio','Alírio e Engrácia juntos numa fotografia de estúdio','Alírio e Engrácia a sorrir, abraçados no estúdio','Alírio e Engrácia de mãos dadas no estúdio','Alírio e Engrácia de mãos dadas, com as testas encostadas'];
function update(html){return html.replace(/(<img\s+src="\/assets\/images\/estudio-0([0-4])\.jpg"\s+alt=")[^"]*/g,(_,prefix,n)=>prefix+descriptions[Number(n)]);}
await writeFile('index.html',update(await readFile('index.html','utf8')));
await writeFile('lib/guest-template.js','// Guest page based on the original invitation, without attendance confirmation.\nexport default '+JSON.stringify(update(template))+';\n');
