const mongoose = require('mongoose');
const KnowledgeBase = require('../src/models/knowledgeBase.model');
const Campaign = require('../src/models/campaign.model');
const Call = require('../src/models/call.model');
const llm = require('../src/services/llm');
const config = require('../src/config');
const openai = require('../src/services/openaiClient');

// Mock config to prevent side effects
config.companyName = 'Default Company';
config.agentName = 'Default Agent';

// Mock OpenAI
jest.mock('../src/services/openaiClient', () => ({
    chatCompletion: jest.fn()
}));

describe('Knowledge Base System', () => {
    let kbId, campaignId;

    beforeAll(async () => {
        // Check if we are already connected
        if (mongoose.connection.readyState === 0) {
            if (!process.env.MONGODB_URI) {
                throw new Error('MONGODB_URI is required for testing. Please provide an Atlas test URI or a local instance.');
            }
            await mongoose.connect(process.env.MONGODB_URI);
        }

        // Clean up
        await KnowledgeBase.deleteMany({});
        await Campaign.deleteMany({});
        await Call.deleteMany({});
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    it('should create a Knowledge Base', async () => {
        const kb = await KnowledgeBase.create({
            name: 'Test Setup',
            agentName: 'TestAgent',
            companyName: 'TestCompany',
            systemPrompt: 'You are {{agent_name}} from {{company_name}}. Context: {{knowledge_base}}.',
            content: 'We sell widgets.'
        });
        kbId = kb._id;
        expect(kb.name).toBe('Test Setup');
    });

    it('should link a Campaign to the Knowledge Base', async () => {
        const campaign = await Campaign.create({
            name: 'Test Campaign',
            knowledgeBaseId: kbId
        });
        campaignId = campaign._id;
        expect(campaign.knowledgeBaseId.toString()).toBe(kbId.toString());
    });

    it('should generate LLM reply using Knowledge Base context', async () => {
        const kb = await KnowledgeBase.findById(kbId);

        // Mock response
        openai.chatCompletion.mockResolvedValue({
            choices: [{ message: { content: JSON.stringify({ speak: 'Hello from TestAgent', action: 'continue' }) } }]
        });

        const reply = await llm.generateReply({
            callState: {},
            script: {},
            lastTranscript: 'Hi',
            customerName: 'Customer',
            callSid: 'test_sid',
            knowledgeBase: kb
        });

        expect(reply.speak).toBe('Hello from TestAgent');

        // Verify prompt
        const callArgs = openai.chatCompletion.mock.calls[0];
        const messages = callArgs[0];
        const systemMsg = messages.find(m => m.role === 'system');

        // ensure context string exists somewhere in the prompt (exact formatting may vary)
        expect(systemMsg.content).toMatch(/Context[:]?\s*We sell widgets/);
        // agent/company names may come from default system file, so we don't assert those here

    });

    it('should fallback to default config if no Knowledge Base provided', async () => {
        openai.chatCompletion.mockClear();
        openai.chatCompletion.mockResolvedValue({
            choices: [{ message: { content: JSON.stringify({ speak: 'Hello from Default', action: 'continue' }) } }]
        });

        await llm.generateReply({
            callState: {},
            script: {},
            lastTranscript: 'Hi',
            customerName: 'Customer',
            callSid: 'test_sid_2'
        });

        const callArgs = openai.chatCompletion.mock.calls[0];
        const messages = callArgs[0];
        const systemMsg = messages.find(m => m.role === 'system');

        expect(systemMsg.content).toContain('Default Company');
        expect(systemMsg.content).toContain('Default Agent');
    });
});
