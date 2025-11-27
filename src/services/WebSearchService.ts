import { requestUrl } from 'obsidian';
import { WebSearchResult, VaultMindError, ErrorCodes } from '../types';

export class WebSearchService {
    private provider: string;
    private apiKey?: string;
    private customEndpoint?: string;
    private cache = new Map<string, { results: WebSearchResult[]; timestamp: number }>();
    private cacheExpiry = 3600000; // 1 hour in milliseconds
    
    constructor(provider: 'duckduckgo' | 'brave' | 'custom', apiKey?: string, customEndpoint?: string) {
        this.provider = provider;
        this.apiKey = apiKey;
        this.customEndpoint = customEndpoint;
    }

    async initialize(): Promise<void> {
        console.debug(`VaultMind: Web search service initialized with ${this.provider}`);
    }

    async search(query: string, limit: number = 5): Promise<WebSearchResult[]> {
        // Check cache first
        const cached = this.cache.get(query);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            console.debug('VaultMind: Using cached search results');
            return cached.results;
        }
        
        let results: WebSearchResult[] = [];
        
        try {
            switch (this.provider) {
                case 'duckduckgo':
                    results = await this.searchDuckDuckGo(query, limit);
                    break;
                case 'brave':
                    results = await this.searchBrave(query, limit);
                    break;
                case 'custom':
                    results = await this.searchCustom(query, limit);
                    break;
            }
            
            // Cache results
            this.cache.set(query, { results, timestamp: Date.now() });
            
            return results;
        } catch (error) {
            console.error('VaultMind: Web search failed', error);
            throw new VaultMindError(
                'Web search failed',
                ErrorCodes.WEB_SEARCH_FAILED,
                error
            );
        }
    }

    private async searchDuckDuckGo(query: string, limit: number): Promise<WebSearchResult[]> {
        // DuckDuckGo Instant Answer API (no API key required)
        const encodedQuery = encodeURIComponent(query);
        const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
        
        try {
            const response = await requestUrl(url);
            const data = response.json;
            
            const results: WebSearchResult[] = [];
            
            // Process instant answer
            if (data.Abstract && data.AbstractText) {
                results.push({
                    title: data.Heading || query,
                    snippet: data.AbstractText,
                    url: data.AbstractURL || '',
                    source: 'DuckDuckGo Instant Answer',
                    timestamp: new Date()
                });
            }
            
            // Process related topics
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                for (const topic of data.RelatedTopics.slice(0, limit - 1)) {
                    if (topic.Text && topic.FirstURL) {
                        results.push({
                            title: topic.Text.split(' - ')[0] || topic.Text,
                            snippet: topic.Text,
                            url: topic.FirstURL,
                            source: 'DuckDuckGo',
                            timestamp: new Date()
                        });
                    }
                }
            }
            
            // If no results from instant answer, try a different approach
            if (results.length === 0) {
                // Fallback: Use a simple scraping approach or return placeholder
                console.debug('VaultMind: No instant answers found, using fallback');
                results.push({
                    title: `Search results for: ${query}`,
                    snippet: 'No instant answers available. Consider using a different search provider or refining your query.',
                    url: `https://duckduckgo.com/?q=${encodedQuery}`,
                    source: 'DuckDuckGo',
                    timestamp: new Date()
                });
            }
            
            return results.slice(0, limit);
        } catch (error) {
            console.error('VaultMind: DuckDuckGo search failed', error);
            throw error;
        }
    }

    private async searchBrave(query: string, limit: number): Promise<WebSearchResult[]> {
        // Brave Search API (requires API key)
        // Note: You'll need to get a free API key from https://brave.com/search/api/
        const apiKey = this.apiKey || '';
        
        if (!apiKey) {
            console.warn('VaultMind: Brave Search API key not configured');
            return [];
        }
        
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
        
        try {
            const response = await requestUrl({
                url: url,
                headers: {
                    'Accept': 'application/json',
                    'X-Subscription-Token': apiKey
                }
            });
            
            const data = response.json;
            
            if (!data.web || !data.web.results) {
                return [];
            }
            
            return data.web.results.map((result: any) => ({
                title: result.title,
                snippet: result.description,
                url: result.url,
                source: 'Brave Search',
                timestamp: new Date()
            }));
        } catch (error) {
            console.error('VaultMind: Brave search failed', error);
            throw error;
        }
    }

    private async searchCustom(query: string, limit: number): Promise<WebSearchResult[]> {
        // Custom search implementation
        if (!this.customEndpoint) {
            console.warn('VaultMind: Custom search endpoint not configured');
            return [];
        }
        
        try {
            const url = `${this.customEndpoint}?q=${encodeURIComponent(query)}&limit=${limit}`;
            const headers: any = {
                'Content-Type': 'application/json'
            };
            
            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }
            
            const response = await requestUrl({ url, headers });
            const data = response.json;
            
            // Assuming the custom API returns an array of results
            // with title, snippet/description, and url fields
            if (Array.isArray(data)) {
                return data.slice(0, limit).map((item: any) => ({
                    title: item.title || item.name || 'Untitled',
                    snippet: item.snippet || item.description || item.summary || '',
                    url: item.url || item.link || '',
                    source: 'Custom Search',
                    timestamp: new Date()
                }));
            }
            
            return [];
        } catch (error) {
            console.error('VaultMind: Custom search failed', error);
            return [];
        }
    }

    async searchWithContext(
        query: string,
        context: string,
        limit: number = 5
    ): Promise<WebSearchResult[]> {
        // Enhance query with context for better results
        const enhancedQuery = this.buildContextualQuery(query, context);
        return this.search(enhancedQuery, limit);
    }

    private buildContextualQuery(query: string, context: string): string {
        // Extract key terms from context
        const keywords = this.extractKeywords(context);
        
        // Combine with original query
        if (keywords.length > 0) {
            return `${query} ${keywords.slice(0, 3).join(' ')}`;
        }
        
        return query;
    }

    private extractKeywords(text: string): string[] {
        // Simple keyword extraction
        // In production, you might use TF-IDF or other NLP techniques
        
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 4);
        
        // Count word frequency
        const frequency = new Map<string, number>();
        for (const word of words) {
            frequency.set(word, (frequency.get(word) || 0) + 1);
        }
        
        // Sort by frequency and return top words
        return Array.from(frequency.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([word]) => word)
            .slice(0, 10);
    }

    clearCache(): void {
        this.cache.clear();
        console.debug('VaultMind: Web search cache cleared');
    }

    async cleanup(): Promise<void> {
        this.clearCache();
    }

    // ============= Alternative Search Methods =============
    
    /**
     * Search using Wikipedia API
     * Good for factual information and definitions
     */
    async searchWikipedia(query: string): Promise<WebSearchResult[]> {
        const url = `https://en.wikipedia.org/w/api.php?` +
                   `action=query&format=json&prop=extracts|info&exintro=1&explaintext=1&` +
                   `inprop=url&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&origin=*`;
        
        try {
            const response = await requestUrl(url);
            const data = response.json;
            
            const results: WebSearchResult[] = [];
            
            if (data.query && data.query.search) {
                for (const item of data.query.search) {
                    results.push({
                        title: item.title,
                        snippet: item.snippet.replace(/<[^>]*>/g, ''), // Remove HTML tags
                        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
                        source: 'Wikipedia',
                        timestamp: new Date()
                    });
                }
            }
            
            return results;
        } catch (error) {
            console.error('VaultMind: Wikipedia search failed', error);
            return [];
        }
    }

    /**
     * Search using arXiv API
     * Good for academic and research papers
     */
    async searchArxiv(query: string, limit: number = 3): Promise<WebSearchResult[]> {
        const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${limit}`;
        
        try {
            const response = await requestUrl(url);
            const text = response.text;
            
            // Parse XML response (simplified parsing)
            const results: WebSearchResult[] = [];
            const entries = text.split('<entry>').slice(1);
            
            for (const entry of entries) {
                const title = this.extractXmlValue(entry, 'title');
                const summary = this.extractXmlValue(entry, 'summary');
                const id = this.extractXmlValue(entry, 'id');
                
                if (title && summary && id) {
                    results.push({
                        title: title.trim(),
                        snippet: summary.trim().substring(0, 200) + '...',
                        url: id.trim(),
                        source: 'arXiv',
                        timestamp: new Date()
                    });
                }
            }
            
            return results;
        } catch (error) {
            console.error('VaultMind: arXiv search failed', error);
            return [];
        }
    }

    private extractXmlValue(xml: string, tag: string): string | null {
        const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1] : null;
    }

    /**
     * Meta-search: Combine results from multiple sources
     */
    async metaSearch(query: string): Promise<WebSearchResult[]> {
        const searches = [
            this.searchDuckDuckGo(query, 2),
            this.searchWikipedia(query),
            // Add more search providers as needed
        ];
        
        try {
            const allResults = await Promise.allSettled(searches);
            const combined: WebSearchResult[] = [];
            
            for (const result of allResults) {
                if (result.status === 'fulfilled') {
                    combined.push(...result.value);
                }
            }
            
            // Remove duplicates based on URL
            const unique = new Map<string, WebSearchResult>();
            for (const result of combined) {
                if (!unique.has(result.url)) {
                    unique.set(result.url, result);
                }
            }
            
            return Array.from(unique.values());
        } catch (error) {
            console.error('VaultMind: Meta-search failed', error);
            return [];
        }
    }
}
