/**
 * CRUD Test Script for Control Plane
 *
 * Usage: bun run scripts/test-crud.ts
 *
 * Requires: DATABASE_URL environment variable
 *           Server running at localhost:3000 (or set BASE_URL env var)
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<any>) {
  try {
    const data = await fn();
    results.push({ name, success: true, data });
    console.log(`✅ ${name}`);
    return data;
  } catch (error: any) {
    results.push({ name, success: false, error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
    return null;
  }
}

async function api<T = any>(
  method: string,
  path: string,
  body?: any
): Promise<{ success: boolean; data?: T; error?: string; message?: string }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || json.message || `HTTP ${res.status}`);
  }

  return json;
}

async function runTests() {
  console.log('\n🧪 Control Plane CRUD Tests\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // Test health endpoint
  await test('Health check', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  });

  // ============ ORG TESTS ============
  console.log('\n📁 Org Tests');

  const org = await test('Create org', async () => {
    const res = await api('POST', '/api/orgs', { name: 'Test Organization' });
    if (!res.success) throw new Error(res.error);
    return res.data;
  });

  if (org) {
    await test('Get org by id', async () => {
      const res = await api('GET', `/api/orgs/${org.id}`);
      if (!res.success) throw new Error(res.error);
      return res.data;
    });

    await test('Update org', async () => {
      const res = await api('PATCH', `/api/orgs/${org.id}`, { name: 'Updated Organization' });
      if (!res.success) throw new Error(res.error);
      if (res.data.name !== 'Updated Organization') throw new Error('Name not updated');
      return res.data;
    });

    await test('List orgs', async () => {
      const res = await api('GET', '/api/orgs');
      if (!res.success) throw new Error(res.error);
      if (!Array.isArray(res.data)) throw new Error('Expected array');
      return res.data;
    });
  }

  // ============ USER TESTS ============
  console.log('\n👤 User Tests');

  let user: any = null;
  if (org) {
    user = await test('Create user', async () => {
      const res = await api('POST', '/api/users', {
        name: 'Test User',
        email: `test-${Date.now()}@example.com`,
        orgId: org.id,
        role: 'MEMBER',
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    });

    if (user) {
      await test('Get user by id', async () => {
        const res = await api('GET', `/api/users/${user.id}`);
        if (!res.success) throw new Error(res.error);
        return res.data;
      });

      await test('Update user', async () => {
        const res = await api('PATCH', `/api/users/${user.id}`, { name: 'Updated User' });
        if (!res.success) throw new Error(res.error);
        if (res.data.name !== 'Updated User') throw new Error('Name not updated');
        return res.data;
      });

      await test('List users by org', async () => {
        const res = await api('GET', `/api/users?orgId=${org.id}`);
        if (!res.success) throw new Error(res.error);
        if (!Array.isArray(res.data)) throw new Error('Expected array');
        return res.data;
      });
    }
  }

  // ============ MEETING TESTS ============
  console.log('\n📅 Meeting Tests');

  let meeting: any = null;
  if (org) {
    meeting = await test('Create meeting', async () => {
      const res = await api('POST', '/api/meetings', {
        title: 'Test Meeting',
        description: 'A test meeting for CRUD validation',
        orgId: org.id,
        scheduledAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    });

    if (meeting) {
      await test('Get meeting by id', async () => {
        const res = await api('GET', `/api/meetings/${meeting.id}`);
        if (!res.success) throw new Error(res.error);
        return res.data;
      });

      await test('Update meeting', async () => {
        const res = await api('PATCH', `/api/meetings/${meeting.id}`, {
          title: 'Updated Meeting',
          description: 'Updated description',
        });
        if (!res.success) throw new Error(res.error);
        if (res.data.title !== 'Updated Meeting') throw new Error('Title not updated');
        return res.data;
      });

      await test('Start meeting', async () => {
        const res = await api('POST', `/api/meetings/${meeting.id}/start`);
        if (!res.success) throw new Error(res.error);
        if (res.data.status !== 'LIVE') throw new Error('Status not LIVE');
        return res.data;
      });

      await test('End meeting', async () => {
        const res = await api('POST', `/api/meetings/${meeting.id}/end`);
        if (!res.success) throw new Error(res.error);
        if (res.data.status !== 'ENDED') throw new Error('Status not ENDED');
        return res.data;
      });

      await test('List meetings by org', async () => {
        const res = await api('GET', `/api/meetings?orgId=${org.id}`);
        if (!res.success) throw new Error(res.error);
        if (!Array.isArray(res.data)) throw new Error('Expected array');
        return res.data;
      });
    }
  }

  // ============ TASK TESTS ============
  console.log('\n✅ Task Tests');

  let task: any = null;
  if (org && user && meeting) {
    task = await test('Create task', async () => {
      const res = await api('POST', '/api/tasks', {
        title: 'Test Task',
        description: 'A test task for CRUD validation',
        orgId: org.id,
        meetingId: meeting.id,
        assigneeId: user.id,
        creatorId: user.id,
        dueAt: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    });

    if (task) {
      await test('Get task by id', async () => {
        const res = await api('GET', `/api/tasks/${task.id}`);
        if (!res.success) throw new Error(res.error);
        return res.data;
      });

      await test('Update task', async () => {
        const res = await api('PATCH', `/api/tasks/${task.id}`, { title: 'Updated Task' });
        if (!res.success) throw new Error(res.error);
        if (res.data.title !== 'Updated Task') throw new Error('Title not updated');
        return res.data;
      });

      await test('Mark task complete', async () => {
        const res = await api('POST', `/api/tasks/${task.id}/complete`);
        if (!res.success) throw new Error(res.error);
        if (res.data.status !== 'DONE') throw new Error('Status not DONE');
        return res.data;
      });

      await test('Reopen task', async () => {
        const res = await api('POST', `/api/tasks/${task.id}/reopen`);
        if (!res.success) throw new Error(res.error);
        if (res.data.status !== 'OPEN') throw new Error('Status not OPEN');
        return res.data;
      });

      await test('List tasks by org', async () => {
        const res = await api('GET', `/api/tasks?orgId=${org.id}`);
        if (!res.success) throw new Error(res.error);
        if (!Array.isArray(res.data)) throw new Error('Expected array');
        return res.data;
      });
    }
  }

  // ============ DECISION TESTS (VERSIONED) ============
  console.log('\n📋 Decision Tests (Versioned)');

  let decision: any = null;
  if (org && user && meeting) {
    decision = await test('Create decision (v1)', async () => {
      const res = await api('POST', '/api/decisions', {
        title: 'Test Decision',
        content: 'We decided to use TypeScript for the project.',
        rationale: 'TypeScript provides better type safety.',
        evidence: 'Meeting transcript section 12:34',
        orgId: org.id,
        meetingId: meeting.id,
        authorId: user.id,
      });
      if (!res.success) throw new Error(res.error);
      if (res.data.version !== 1) throw new Error('Expected version 1');
      return res.data;
    });

    if (decision) {
      await test('Get decision by id', async () => {
        const res = await api('GET', `/api/decisions/${decision.id}`);
        if (!res.success) throw new Error(res.error);
        return res.data;
      });

      await test('Get decision by ref', async () => {
        const res = await api('GET', `/api/decisions/ref/${decision.decisionRef}`);
        if (!res.success) throw new Error(res.error);
        return res.data;
      });

      const revision = await test('Create decision revision (v2)', async () => {
        const res = await api('POST', `/api/decisions/ref/${decision.decisionRef}/revise`, {
          content: 'We decided to use TypeScript with strict mode for the project.',
          rationale: 'Strict mode catches more errors at compile time.',
        });
        if (!res.success) throw new Error(res.error);
        if (res.data.version !== 2) throw new Error('Expected version 2');
        return res.data;
      });

      await test('Get decision history', async () => {
        const res = await api('GET', `/api/decisions/ref/${decision.decisionRef}/history`);
        if (!res.success) throw new Error(res.error);
        if (!Array.isArray(res.data) || res.data.length < 2) {
          throw new Error('Expected at least 2 versions');
        }
        return res.data;
      });

      await test('Get specific version (v1)', async () => {
        const res = await api('GET', `/api/decisions/ref/${decision.decisionRef}/version/1`);
        if (!res.success) throw new Error(res.error);
        if (res.data.version !== 1) throw new Error('Expected version 1');
        return res.data;
      });

      await test('Get latest version', async () => {
        const res = await api('GET', `/api/decisions/ref/${decision.decisionRef}`);
        if (!res.success) throw new Error(res.error);
        if (res.data.version !== 2) throw new Error('Expected version 2 (latest)');
        return res.data;
      });

      await test('List decisions by org', async () => {
        const res = await api('GET', `/api/decisions?orgId=${org.id}`);
        if (!res.success) throw new Error(res.error);
        if (!Array.isArray(res.data)) throw new Error('Expected array');
        return res.data;
      });
    }
  }

  // ============ CLEANUP ============
  console.log('\n🧹 Cleanup');

  if (decision) {
    await test('Delete decision (all versions)', async () => {
      const res = await api('DELETE', `/api/decisions/ref/${decision.decisionRef}`);
      if (!res.success) throw new Error(res.error);
      return res;
    });
  }

  if (task) {
    await test('Delete task', async () => {
      const res = await api('DELETE', `/api/tasks/${task.id}`);
      if (!res.success) throw new Error(res.error);
      return res;
    });
  }

  if (meeting) {
    await test('Delete meeting', async () => {
      const res = await api('DELETE', `/api/meetings/${meeting.id}`);
      if (!res.success) throw new Error(res.error);
      return res;
    });
  }

  if (user) {
    await test('Delete user', async () => {
      const res = await api('DELETE', `/api/users/${user.id}`);
      if (!res.success) throw new Error(res.error);
      return res;
    });
  }

  if (org) {
    await test('Delete org', async () => {
      const res = await api('DELETE', `/api/orgs/${org.id}`);
      if (!res.success) throw new Error(res.error);
      return res;
    });
  }

  // ============ SUMMARY ============
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Total:  ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    for (const r of results.filter((r) => !r.success)) {
      console.log(`   - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }

  console.log('\n✅ All tests passed!\n');
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
