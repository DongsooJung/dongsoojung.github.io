/**
 * GitHub Actions용 데이터 수집기 공통 유틸리티
 * 재시도, 폴백, 실패 알림 기능 제공
 */

/**
 * 지수 백오프로 재시도
 * @param {Function} fn - 재시도할 비동기 함수
 * @param {Object} options
 * @param {number} options.maxAttempts - 최대 시도 횟수 (기본값: 3)
 * @param {number} options.baseDelayMs - 기본 지연 시간 (기본값: 2000ms)
 * @param {number} options.maxDelayMs - 최대 지연 시간 (기본값: 30000ms)
 * @param {string} options.label - 로그용 라벨
 * @returns {Promise<any>}
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 2000,
    maxDelayMs = 30000,
    label = 'operation',
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        console.warn(`${label} 실패 (시도 ${attempt}/${maxAttempts}): ${error.message}`);
        console.warn(`${delayMs}ms 후 재시도...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw new Error(`${label} 최종 실패 (${maxAttempts}회 시도): ${lastError.message}`, { cause: lastError });
}

/**
 * 기존 데이터 파일 로드 (폴백용)
 * @param {string} filePath - 파일 경로
 * @returns {Promise<any|null>} 기존 데이터 또는 null
 */
export async function loadExistingData(filePath) {
  try {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 데이터 유효성 검증
 * @param {any} data - 검증할 데이터
 * @param {Function} validator - 검증 함수 (data => boolean)
 * @returns {boolean}
 */
export function validateData(data, validator) {
  try {
    return validator(data);
  } catch {
    return false;
  }
}

/**
 * GitHub Issues API를 통한 실패 알림
 * @param {Object} params
 * @param {string} params.workflowName - 워크플로우 이름
 * @param {string} params.runId - 워크플로우 실행 ID
 * @param {string} params.error - 에러 메시지
 * @param {string} params.repo - 저장소 (형식: owner/repo)
 * @param {string} params.token - GitHub 토큰
 * @returns {Promise<void>}
 */
export async function reportFailure(params) {
  const { workflowName, runId, error, repo, token } = params;
  
  if (!token) {
    console.warn('GITHUB_TOKEN이 없어 실패 알림을 건너뜁니다.');
    return;
  }

  const [owner, repoName] = repo.split('/');
  const issueTitle = `[collector-failure] ${workflowName} 실패`;
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;
  
  try {
    // 기존 open 이슈 검색
    const searchUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(
      `repo:${repo} is:issue is:open label:collector-failure in:title "${workflowName}"`
    )}`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'stargate-collector-bot/1.0',
      },
    });

    if (!searchResponse.ok) {
      console.warn(`이슈 검색 실패 (HTTP ${searchResponse.status}), 알림 건너뜀`);
      return;
    }

    const searchResult = await searchResponse.json();
    const existingIssue = searchResult.items?.[0];

    if (existingIssue) {
      // 기존 이슈에 코멘트 추가
      const commentBody = `## 재발생\n\n**Run:** ${runUrl}\n**Time:** ${new Date().toISOString()}\n**Error:**\n\`\`\`\n${error.slice(0, 1000)}\n\`\`\``;
      
      await fetch(`https://api.github.com/repos/${repo}/issues/${existingIssue.number}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'stargate-collector-bot/1.0',
        },
        body: JSON.stringify({ body: commentBody }),
      });
      
      console.log(`기존 이슈 #${existingIssue.number}에 코멘트 추가됨`);
    } else {
      // 새 이슈 생성
      const issueBody = `## 수집기 실패\n\n**Workflow:** ${workflowName}\n**Run:** ${runUrl}\n**Time:** ${new Date().toISOString()}\n\n### Error\n\`\`\`\n${error.slice(0, 2000)}\n\`\`\`\n\n이 이슈는 자동으로 생성되었습니다.`;
      
      await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'stargate-collector-bot/1.0',
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: ['collector-failure'],
        }),
      });
      
      console.log(`새 실패 알림 이슈 생성됨: ${issueTitle}`);
    }
  } catch (err) {
    console.warn(`실패 알림 전송 중 오류 (무시됨): ${err.message}`);
  }
}
