import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    Plugin,
    State as AgentState,
    elizaLogger,
    composeContext,
    generateObjectDeprecated,
    ModelClass,
} from "@elizaos/core";

interface AnnaArchiveBook {
    title: string;
    author: string;
    md5: string;
    imgUrl: string;
    size: string;
    genre: string;
    format: string;
    year: string;
    sources: string[];
    imgFallbackColor?: string | null;
}

interface AnnaArchiveResponse {
    total: number;
    books: AnnaArchiveBook[];
}

const RAPID_API_KEY = process.env.RAPID_API_KEY;
const RAPID_API_HOST = 'annas-archive-api.p.rapidapi.com';

const SEARCH_TEMPLATE = `Given the query, extract the search term.

Example response:
\`\`\`json
{
    "searchTerm": "superintelligence"
}
\`\`\`

{{query}}

Extract ONLY the core search term from the query, removing any conversational elements.`;

const DOWNLOAD_TEMPLATE = `Given the recent messages, find the book to download.

Example response:
\`\`\`json
{
    "md5": "8fd5a47e020c1e95c54bffa00cbf5484",
    "title": "Superintelligence: Paths, Dangers, Strategies",
    "author": "Nick Bostrom"
}
\`\`\`

{{recentMessages}}

Extract the MD5 hash, title, and author of the requested book from the chat history.`;

const LIBRARY_SEARCH: Action = {
    name: "LIBRARY_SEARCH",
    description: "Search for books using the exact search term provided",
    similes: ["search", "find", "look for"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            return !!message.content?.text;
        } catch {
            return false;
        }
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: AgentState,
        options: any,
        callback: HandlerCallback
    ) => {
        try {
            if (!RAPID_API_KEY) {
                callback({ text: "Error: RAPID_API_KEY is not configured" });
                return;
            }

            // Compose state if not provided
            if (!state) {
                state = (await runtime.composeState(message)) as AgentState;
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            const searchContext = composeContext({
                state: { ...state, query: message.content.text },
                template: SEARCH_TEMPLATE
            });

            const content = await generateObjectDeprecated({
                runtime,
                context: searchContext,
                modelClass: ModelClass.LARGE,
            });

            if (!content?.searchTerm) {
                throw new Error("No search term found in response");
            }

            elizaLogger.log("Searching for:", content.searchTerm);

            const searchParams = new URLSearchParams({
                q: content.searchTerm,
                limit: '10',
                sort: 'mostRelevant'
            });

            const url = `https://${RAPID_API_HOST}/search?${searchParams.toString()}`;
            elizaLogger.log("Search URL:", url);

            const apiResponse = await fetch(url, {
                method: 'GET',
                headers: {
                    'x-rapidapi-host': RAPID_API_HOST,
                    'x-rapidapi-key': RAPID_API_KEY
                }
            });

            let data: AnnaArchiveResponse;
            const responseText = await apiResponse.text();

            try {
                data = JSON.parse(responseText);
            } catch (e) {
                elizaLogger.error("Failed to parse response:", responseText);
                throw new Error(`Failed to parse API response: ${e.message}`);
            }

            if (!apiResponse.ok) {
                elizaLogger.error("API Error Response:", data);
                throw new Error(`API request failed with status ${apiResponse.status}: ${JSON.stringify(data)}`);
            }

            elizaLogger.log("Search results:", data);

            if (!data.books || data.books.length === 0) {
                callback({ text: "No results found. Try modifying your search terms or using fewer filters." });
                return;
            }

            const formatted = data.books.map(book =>
                `"${book.title}"${book.author ? ` by ${book.author}` : ''}${book.year ? ` (${book.year})` : ''}\n` +
                `Format: ${book.format}, Size: ${book.size}, Genre: ${book.genre || 'Unknown'}\n` +
                `MD5: ${book.md5}`
            ).join('\n\n');

            callback({
                text: `Found ${data.total} books. Here are the top ${data.books.length} results:\n\n${formatted}\n\nTo download a book, ask me using its MD5 hash.`
            });
        } catch (error) {
            elizaLogger.error("Library search error:", error);
            callback({ text: `Sorry, I'm having trouble with the search: ${error.message}` });
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "i want to read an ML book" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "machine learning",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "looking for AI textbooks" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "artificial intelligence",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "need a DL book" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "deep learning",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "find me a book on NLP" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "natural language processing",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "i want to read superintelligence" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "superintelligence",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "can you find books by nick bostrom?" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "nick bostrom",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "i wanna read harry potter" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "harry potter",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "please help me find books on machine learning" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "machine learning",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "looking for lord of the rings" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "lord of the rings",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "i need a book on javascript programming" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "javascript programming",
                    action: "LIBRARY_SEARCH"
                },
            },
        ],
    ],
};

const LIBRARY_DOWNLOAD: Action = {
    name: "LIBRARY_DOWNLOAD",
    description: "Get download links for a book using its MD5 hash",
    similes: ["download", "get book", "download book"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            return true; // We'll handle validation in the handler
        } catch {
            return false;
        }
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: AgentState,
        options: any,
        callback: HandlerCallback
    ) => {
        try {
            if (!RAPID_API_KEY) {
                callback({ text: "Error: RAPID_API_KEY is not configured" });
                return;
            }

            // Compose state if not provided
            if (!state) {
                state = (await runtime.composeState(message)) as AgentState;
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            let md5: string;
            const directHash = message.content.text.match(/[a-f0-9]{32}/)?.[0];
            if (directHash) {
                md5 = directHash;
            } else {
                const downloadContext = composeContext({
                    state,
                    template: DOWNLOAD_TEMPLATE
                });

                const content = await generateObjectDeprecated({
                    runtime,
                    context: downloadContext,
                    modelClass: ModelClass.LARGE,
                });

                if (!content?.md5) {
                    throw new Error("Could not find the MD5 hash for the requested book");
                }

                md5 = content.md5;
                callback({ text: `Downloading "${content.title}" by ${content.author}...` });
            }

            const url = `https://${RAPID_API_HOST}/download?md5=${md5}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'x-rapidapi-host': RAPID_API_HOST,
                    'x-rapidapi-key': RAPID_API_KEY
                }
            });

            let links: string[];
            const responseText = await response.text();

            try {
                links = JSON.parse(responseText);
            } catch (e) {
                elizaLogger.error("Failed to parse response:", responseText);
                throw new Error(`Failed to parse API response: ${e.message}`);
            }

            if (!response.ok) {
                elizaLogger.error("API Error Response:", links);
                throw new Error(`API request failed with status ${response.status}: ${JSON.stringify(links)}`);
            }

            if (!links || links.length === 0) {
                callback({ text: "No download links found for this book." });
                return;
            }

            const formatted = links.map((link, index) => `${index + 1}. ${link}`).join('\n');
            callback({
                text: `Here are the download links for the book:\n\n${formatted}`
            });
        } catch (error) {
            elizaLogger.error("Library download error:", error);
            callback({ text: `Sorry, I'm having trouble getting the download links: ${error.message}` });
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "download the bostrom book" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: `Downloading "Superintelligence: Paths, Dangers, Strategies" by Nick Bostrom...`,
                    action: "LIBRARY_DOWNLOAD"
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Download book with MD5 5b723c172fc4c8a77f476e7016ad3945" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here are the download links for the book:",
                    action: "LIBRARY_DOWNLOAD"
                },
            },
        ],
    ],
};

export const libraryPlugin: Plugin = {
    name: "library",
    description: "Search for books and academic papers",
    actions: [LIBRARY_SEARCH, LIBRARY_DOWNLOAD],
    evaluators: [],
    providers: [],
};

export default libraryPlugin;
