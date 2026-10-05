import { AgentType, TerminalLine } from '../types/canvas';

export interface SimulationResult {
  lines: TerminalLine[];
  finalStatus: 'idle' | 'working' | 'approval_required' | 'tests_passing';
  memoryEntry?: {
    key: string;
    value: string;
    type: 'fact' | 'decision' | 'changelog';
  };
  lastAction: string;
  tokensGained: number;
}

export function generateSimulationResponse(
  agentType: AgentType,
  prompt: string,
  agentName: string
): SimulationResult {
  const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const idPrefix = Math.random().toString(36).substring(2, 7);
  const lower = prompt.toLowerCase().trim();

  // Greetings or general conversation
  if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower.startsWith('hello') || lower.startsWith('hi ') || lower.includes('who are you') || lower.includes('help')) {
    return {
      lines: [
        {
          id: `${idPrefix}-1`,
          text: `[Simulation] No provider request was sent.`,
          type: 'route',
          timestamp,
        },
        {
          id: `${idPrefix}-2`,
          text: `👋 Hello! I am ${agentName}. This is a sample response from demo simulation mode.\n\nFor live model responses, turn off Demo simulation in Settings and connect a gateway.`,
          type: 'output',
          timestamp,
        },
        {
          id: `${idPrefix}-3`,
          text: `✓ Agent standby and ready for tasks.`,
          type: 'success',
          timestamp,
        },
      ],
      finalStatus: 'idle',
      lastAction: 'Standing by for coding instruction',
      tokensGained: 680,
    };
  }

  // OmniRoute gateway specific
  if (agentType === 'omniroute' || lower.includes('omniroute') || lower.includes('route') || lower.includes('fallback') || lower.includes('compress')) {
    return {
      lines: [
        {
          id: `${idPrefix}-1`,
          text: `[Simulation] Example route for: "${prompt.slice(0, 45)}..."`,
          type: 'system',
          timestamp,
        },
        {
          id: `${idPrefix}-2`,
          text: `Demo mode is enabled. No request or token compression was performed.`,
          type: 'route',
          timestamp,
        },
        {
          id: `${idPrefix}-3`,
          text: `→ This example does not contact OmniRoute. Select a live model in Settings to make a real request.`,
          type: 'route',
          timestamp,
        },
        {
          id: `${idPrefix}-4`,
          text: `+ // Sample output only\n+ export const routeConfig = {\n+   provider: "configured gateway",\n+   model: "selected in Settings"\n+ };`,
          type: 'diff',
          timestamp,
        },
        {
          id: `${idPrefix}-5`,
          text: `✓ Sample response complete. No gateway was contacted.`,
          type: 'success',
          timestamp,
        },
      ],
      finalStatus: 'idle',
      lastAction: 'Demo response · no gateway request',
      tokensGained: 3220,
      memoryEntry: {
        key: `omniroute.routing.${idPrefix}`,
        value: `Generated a demo response for "${prompt.slice(0, 40)}" without contacting a provider.`,
        type: 'changelog',
      },
    };
  }

  // DeepSeek reasoning prompts
  if (agentType === 'deepseek' || lower.includes('reason') || lower.includes('deepseek') || lower.includes('plan') || lower.includes('architect')) {
    return {
      lines: [
        {
          id: `${idPrefix}-1`,
          text: `<think>\nAnalyzing structural constraints for: "${prompt}"\n1. Security boundary check: Ensure zero plaintext secrets.\n2. Concurrency model: Non-blocking async event loop with idempotency keys.\n3. Synthesizing verified 4-step execution strategy.\n</think>`,
          type: 'output',
          timestamp,
        },
        {
          id: `${idPrefix}-2`,
          text: `Sample plan (4 steps):\n1. Review the current session refresh flow\n2. Add tests for concurrent refresh requests\n3. Check error handling and token rotation\n4. Run the relevant test suite`,
          type: 'plan',
          timestamp,
        },
        {
          id: `${idPrefix}-3`,
          text: `Plan ready. Click "Approve Plan" to execute verified steps.`,
          type: 'output',
          timestamp,
        },
      ],
      finalStatus: 'approval_required',
      lastAction: 'Sample plan ready · Awaiting approval',
      tokensGained: 4100,
      memoryEntry: {
        key: `deepseek.plan.${idPrefix}`,
        value: `Generated a sample plan for "${prompt.slice(0, 35)}".`,
        type: 'decision',
      },
    };
  }

  // Testing prompts
  if (lower.includes('test') || lower.includes('vitest') || lower.includes('verify') || lower.includes('jest')) {
    return {
      lines: [
        {
          id: `${idPrefix}-1`,
          text: `Generating a sample test response...`,
          type: 'system',
          timestamp,
        },
        {
          id: `${idPrefix}-2`,
          text: `Generated 8 test suites targeting boundary conditions and error handlers.`,
          type: 'output',
          timestamp,
        },
        {
          id: `${idPrefix}-3`,
          text: `+ describe("Authentication Flow", () => {\n+   it("should reject expired tokens with 401", async () => {\n+     const res = await request(app).get("/api/me").set("Authorization", "Bearer expired");\n+     expect(res.status).toBe(401);\n+   });\n+ });`,
          type: 'diff',
          timestamp,
        },
        {
          id: `${idPrefix}-4`,
          text: `Running: vitest run --coverage\n ✓ src/tests/auth.test.ts (8/8 tests passed)\n ✓ All test suites green. 99.1% branch coverage.`,
          type: 'success',
          timestamp,
        },
      ],
      finalStatus: 'tests_passing',
      lastAction: 'Sample tests shown · not executed',
      tokensGained: 2450,
      memoryEntry: {
        key: `test.result.${idPrefix}`,
        value: `${agentName} verified "${prompt.slice(0, 40)}..." - 8/8 tests passing.`,
        type: 'changelog',
      },
    };
  }

  // Refactor / Code Editing prompts
  if (lower.includes('refactor') || lower.includes('auth') || lower.includes('middleware') || lower.includes('jwt') || lower.includes('code') || lower.includes('fix')) {
    return {
      lines: [
        {
          id: `${idPrefix}-1`,
          text: `[Simulation] No model was selected and no files were changed.`,
          type: 'system',
          timestamp,
        },
        {
          id: `${idPrefix}-2`,
          text: `Reading target files and applying type-safe transformation...`,
          type: 'output',
          timestamp,
        },
        {
          id: `${idPrefix}-3`,
          text: `@@ -12,6 +12,10 @@\n- export function verifySession(rawToken: string) {\n-   return jwt.decode(rawToken);\n+ export async function verifySession(rawToken: string): Promise<SessionPayload> {\n+   const { payload } = await jose.jwtVerify(rawToken, PUBLIC_KEY);\n+   return payload as SessionPayload;\n }`,
          type: 'diff',
          timestamp,
        },
        {
          id: `${idPrefix}-4`,
          text: `✓ Sample patch displayed. No files were changed.`,
          type: 'success',
          timestamp,
        },
      ],
      finalStatus: 'idle',
      lastAction: 'Sample patch · no files changed',
      tokensGained: 3400,
      memoryEntry: {
        key: `refactor.${idPrefix}`,
        value: `${agentName} displayed a sample refactor for "${prompt.slice(0, 35)}".`,
        type: 'changelog',
      },
    };
  }

  // General coding instruction
  return {
    lines: [
      {
        id: `${idPrefix}-1`,
        text: `[Simulation] Sample response for: "${prompt}"`,
        type: 'system',
        timestamp,
      },
      {
        id: `${idPrefix}-2`,
        text: `+ // Sample output only\n+ export function executeFeature() {\n+   return { success: true };\n+ }`,
        type: 'diff',
        timestamp,
      },
      {
        id: `${idPrefix}-3`,
        text: `✓ Sample output complete. No files were changed.`,
        type: 'success',
        timestamp,
      },
    ],
    finalStatus: 'idle',
    lastAction: `Completed: ${prompt.slice(0, 35)}...`,
    tokensGained: 1800,
    memoryEntry: {
      key: `task.${idPrefix}`,
      value: `${agentName} displayed a sample response for "${prompt.slice(0, 50)}".`,
      type: 'changelog',
    },
  };
}
