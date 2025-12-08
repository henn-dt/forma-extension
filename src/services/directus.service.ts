// TypeScript interfaces matching Directus collections
interface FormaUser {
    id?: number;
    user_created?: string;
    user_updated?: string;
    date_created?: string;
    date_updated?: string;
    name: string;
    email: string;
    password?: string;
    project_ids?: string[];
}

interface FormaProject {
    id?: string;
    user_created?: string;
    user_updated?: string;
    date_created?: string;
    date_updated?: string;
    porject_id: string; // Forma project ID (note: typo in Directus schema)
    name?: string; // Project name from Forma
    coordinates?: string; // "[longitude, latitude]" stored as string
    size?: string; // "4951m × 4886m"
    satellite_image?: string;
    users?: string[];
}

interface ProjectSyncResult {
    success: boolean;
    project: FormaProject;
    isNew: boolean;
    userLinked: boolean;
    message: string;
}

interface MyProjectsResult {
    success: boolean;
    projects: FormaProject[];
    count: number;
}

interface AuthTokens {
    access_token: string;
    refresh_token: string;
    expires: number;
}

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string | null {
    return localStorage.getItem('authToken');
}

/**
 * Make authenticated API request
 */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getAuthToken();
    const headers = new Headers(options.headers || {});
    
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    
    return fetch(url, {
        ...options,
        headers
    });
}

class DirectusService {
    private currentUser: FormaUser | null = null;
    private baseUrl = '/api/directus';

    constructor() {
        // Load user from storage on initialization
        this.loadUser();
    }

    // ==================== FORMA PROJECT SYNC METHODS ====================

    /**
     * Sync a Forma project to Directus
     * Called when user clicks "Get Project Info"
     */
    async syncFormaProject(
        formaProjectId: string,
        name: string, // Project name from Forma
        coordinates: [number, number], // [longitude, latitude]
        size: string // "4951m × 4886m"
    ): Promise<ProjectSyncResult> {
        try {
            const response = await authFetch('/api/forma-project/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    formaProjectId,
                    name,
                    coordinates,
                    size
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to sync project');
            }

            return await response.json();
        } catch (error: any) {
            console.error('Failed to sync Forma project:', error);
            throw new Error(error.message || 'Failed to sync project');
        }
    }

    /**
     * Check if a Forma project exists in Directus
     */
    async checkFormaProject(formaProjectId: string): Promise<{ exists: boolean; project: FormaProject | null }> {
        try {
            const response = await authFetch(`/api/forma-project/check/${encodeURIComponent(formaProjectId)}`);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to check project');
            }

            return await response.json();
        } catch (error: any) {
            console.error('Failed to check Forma project:', error);
            throw new Error(error.message || 'Failed to check project');
        }
    }

    /**
     * Get all projects for the current authenticated user
     */
    async getMyProjects(): Promise<MyProjectsResult> {
        try {
            const response = await authFetch('/api/my-projects');

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to fetch projects');
            }

            return await response.json();
        } catch (error: any) {
            console.error('Failed to get my projects:', error);
            throw new Error(error.message || 'Failed to load projects');
        }
    }

    // ==================== AUTHENTICATION METHODS ====================

    /**
     * Login with email (Proxy to backend)
     * Note: With static token proxy, we primarily verify the user exists by email.
     * Password verification would require additional backend logic.
     */
    async login(email: string, password: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Login failed');
            }

            const user = await response.json();
            this.currentUser = user;
            this.saveUser(user);

            return { user, access_token: 'proxy-session' };
        } catch (error: any) {
            console.error('Login failed:', error);
            throw new Error(error.message || 'Login failed');
        }
    }

    /**
     * Register a new user
     * Note: This might need backend implementation if we want to support registration
     */
    async register(name: string, email: string, password: string): Promise<FormaUser> {
        // For now, we'll throw as we haven't implemented registration in the proxy yet
        // or we can implement it if needed.
        throw new Error('Registration not supported in proxy mode yet');
    }

    /**
     * Logout current user
     */
    async logout(): Promise<void> {
        this.currentUser = null;
        localStorage.removeItem('forma_user');
    }

    /**
     * Refresh access token
     * Not needed for proxy mode as we don't hold the Directus token
     */
    async refreshAuth(): Promise<void> {
        // No-op
    }

    /**
     * Load current user information
     */
    private loadUser(): void {
        const stored = localStorage.getItem('forma_user');
        if (stored) {
            try {
                this.currentUser = JSON.parse(stored);
            } catch (e) {
                console.error('Failed to parse stored user');
                localStorage.removeItem('forma_user');
            }
        }
    }

    private saveUser(user: FormaUser): void {
        localStorage.setItem('forma_user', JSON.stringify(user));
    }

    /**
     * Get current user
     */
    getCurrentUser(): any {
        return this.currentUser;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return !!this.currentUser;
    }

    // ==================== PROJECT METHODS ====================

    /**
     * Get all projects for a specific user
     */
    async getUserProjects(userId: number): Promise<FormaProject[]> {
        try {
            if (!this.currentUser?.email) throw new Error('User not logged in');

            const response = await fetch(`${this.baseUrl}/projects?email=${encodeURIComponent(this.currentUser.email)}`);

            if (!response.ok) {
                throw new Error('Failed to fetch projects');
            }

            return await response.json();
        } catch (error: any) {
            console.error('Failed to get user projects:', error);
            throw new Error(error.message || 'Failed to load projects');
        }
    }

    /**
     * Get a single project by ID
     */
    async getProject(projectId: number): Promise<FormaProject | null> {
        try {
            const response = await fetch(`${this.baseUrl}/projects/${projectId}`);

            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error('Failed to fetch project');
            }

            return await response.json();
        } catch (error: any) {
            console.error('Failed to get project:', error);
            throw new Error(error.message || 'Failed to load project');
        }
    }

    /**
     * Get a project by Forma project_id
     * Note: We might need to add a specific route for this or filter on client side
     * For now, let's assume we filter on client side or add a backend route later.
     * Actually, let's implement a simple filter on the backend projects list for now
     * or just fetch all and filter here if the list isn't huge.
     * Better: Add a query param to the backend route.
     */
    async getProjectByFormaId(formaProjectId: string): Promise<FormaProject | null> {
        try {
            // Reusing the projects endpoint - ideally we'd have a specific filter endpoint
            // For now, we'll fetch user projects and find it
            if (!this.currentUser) return null;

            const projects = await this.getUserProjects(this.currentUser.id!);
            return projects.find(p => p.porject_id === formaProjectId) || null;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to load project';
            console.error('Failed to get project by Forma ID:', error);
            throw new Error(message);
        }
    }

    /**
     * Create a new project
     */
    async createProject(projectData: Partial<FormaProject>): Promise<FormaProject> {
        try {
            const response = await fetch(`${this.baseUrl}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });

            if (!response.ok) {
                throw new Error('Failed to create project');
            }

            return await response.json();
        } catch (error: any) {
            console.error('Failed to create project:', error);
            throw new Error(error.message || 'Failed to create project');
        }
    }

    /**
     * Update an existing project
     */
    async updateProject(projectId: number, data: Partial<FormaProject>): Promise<FormaProject> {
        try {
            const response = await fetch(`${this.baseUrl}/projects/${projectId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error('Failed to update project');
            }

            return await response.json();
        } catch (error: any) {
            console.error('Failed to update project:', error);
            throw new Error(error.message || 'Failed to update project');
        }
    }

    /**
     * Delete a project
     */
    async deleteProject(projectId: number): Promise<void> {
        try {
            const response = await fetch(`${this.baseUrl}/projects/${projectId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete project');
            }
        } catch (error: any) {
            console.error('Failed to delete project:', error);
            throw new Error(error.message || 'Failed to delete project');
        }
    }
}

// Export singleton instance
export const directusService = new DirectusService();
export type { FormaUser, FormaProject, AuthTokens, ProjectSyncResult, MyProjectsResult };
