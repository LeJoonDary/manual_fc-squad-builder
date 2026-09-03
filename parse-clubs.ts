import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

type Club = { id: number; name: string; short_name: string; league_id: number };
type ParseFailure = { line: number; reason: string; content: string };

const EXPECTED_CLUB_COUNT = 662;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inputPath = path.join(__dirname, 'raw_clubs.txt');
const outputPath = path.join(__dirname, 'clubs.json');

// 클럽 종류를 나타내는 말은 축약어의 고유 문자로 사용하지 않는다.
const CLUB_QUALIFIERS = new Set([
    'fc', 'ac', 'afc', 'cf', 'sc', 'rc', 'rcd', 'cd', 'ud', 'sd', 'sk', 'fk',
    'sv', 'vfl', 'vfb', 'sl', 'ssc', 'sfc', 'tsv', 'tsg', 'kv', 'if', 'bk',
    'ff', 'as', 'ca', 'club', 'clube', 'fútbol', 'futbol', 'football'
]);

function letters(value: string): string[] {
    return Array.from(value.normalize('NFC')).filter(char => /\p{L}/u.test(char));
}

function generateShortName(name: string): string {
    const words = name
        .replace(/[‐‑‒–—-]/gu, ' ')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .filter(word => !CLUB_QUALIFIERS.has(word.toLocaleLowerCase('en-US')))
        .filter(word => /\p{L}/u.test(word));
    const usable = words.length > 0 ? words : name.split(/\s+/u).filter(Boolean);
    let result: string;

    if (usable.length >= 3) {
        result = usable.slice(0, 3).map(word => letters(word)[0] ?? '').join('');
    } else if (usable.length === 2) {
        result = [...letters(usable[0]).slice(0, 2), letters(usable[1])[0] ?? ''].join('');
    } else {
        result = letters(usable[0] ?? name).slice(0, 3).join('');
    }

    const fallback = letters(name).join('');
    while (Array.from(result).length < 3 && fallback.length > 0) {
        result += fallback[Array.from(result).length % fallback.length];
    }
    return result.toLocaleUpperCase('en-US');
}

function parseLine(content: string, lineNumber: number): Club | ParseFailure {
    // 실제 파일의 탭 구분과 명세의 쉼표 구분을 모두 허용한다.
    // 이름 안의 쉼표는 세 번째 필드에 그대로 남긴다.
    const match = content.match(/^\s*(\d+)\s*(?:\t|,)\s*(\d+)\s*(?:\t|,)\s*(.*?)\s*$/u);
    if (!match) {
        return { line: lineNumber, reason: '필드 형식이 <league_id>,<club_id>,<club_name>과 다릅니다.', content };
    }

    const leagueId = Number(match[1]);
    const id = Number(match[2]);
    const name = match[3].trim();
    if (!Number.isSafeInteger(leagueId) || leagueId <= 0) {
        return { line: lineNumber, reason: 'league_id가 양의 정수가 아닙니다.', content };
    }
    if (!Number.isSafeInteger(id) || id <= 0) {
        return { line: lineNumber, reason: 'club_id가 양의 정수가 아닙니다.', content };
    }
    if (!name) return { line: lineNumber, reason: 'club_name이 비어 있습니다.', content };
    return { id, name, short_name: generateShortName(name), league_id: leagueId };
}

function parseClubsData(): Club[] {
    const raw = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/u, '');
    const allLines = raw.split(/\r?\n/u);
    if (allLines.at(-1) === '') allLines.pop();

    const failures: ParseFailure[] = [];
    const clubsMap = new Map<number, Club>();
    allLines.forEach((content, index) => {
        const lineNumber = index + 1;
        if (!content.trim()) {
            failures.push({ line: lineNumber, reason: '빈 줄입니다.', content });
            return;
        }
        const parsed = parseLine(content, lineNumber);
        if ('line' in parsed) {
            failures.push(parsed);
            return;
        }
        const existing = clubsMap.get(parsed.id);
        if (existing) {
            const same = existing.name === parsed.name && existing.league_id === parsed.league_id;
            failures.push({
                line: lineNumber,
                reason: same ? `중복 club_id ${parsed.id}입니다.` : `club_id ${parsed.id}가 서로 다른 데이터로 중복되었습니다.`,
                content
            });
            return;
        }
        clubsMap.set(parsed.id, parsed);
    });

    const clubs = Array.from(clubsMap.values());
    const invalidLeagueIds = clubs.filter(club => !Number.isSafeInteger(club.league_id) || club.league_id <= 0);
    const invalidShortNames = clubs.filter(club => Array.from(club.short_name).length < 3);

    console.log(`원본 총 라인 수: ${allLines.length}`);
    console.log(`변환된 고유 클럽 수: ${clubs.length}`);
    console.log(`중복 제거 후 662개 여부: ${clubs.length === EXPECTED_CLUB_COUNT ? '통과' : '실패'}`);
    console.log(`league_id 숫자 타입/누락 검증: ${invalidLeagueIds.length === 0 ? '통과' : `실패 (${invalidLeagueIds.length}개)`}`);
    console.log(`short_name 3글자 이상 검증: ${invalidShortNames.length === 0 ? '통과' : `실패 (${invalidShortNames.length}개)`}`);

    if (failures.length > 0) {
        console.error(`파싱 실패 또는 중복 줄: ${failures.length}개`);
        failures.forEach(failure => console.error(`- ${failure.line}번 줄: ${failure.reason} | ${failure.content}`));
    } else {
        console.log('누락/파싱 실패 줄: 없음');
    }

    if (failures.length > 0 || allLines.length !== EXPECTED_CLUB_COUNT || clubs.length !== EXPECTED_CLUB_COUNT || invalidLeagueIds.length > 0 || invalidShortNames.length > 0) {
        throw new Error('검증에 실패하여 clubs.json을 저장하지 않았습니다.');
    }

    fs.writeFileSync(outputPath, `${JSON.stringify(clubs, null, 2)}\n`, 'utf8');
    console.log(`저장 완료: ${outputPath}`);
    return clubs;
}

parseClubsData();
