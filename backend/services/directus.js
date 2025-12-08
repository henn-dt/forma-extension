const { createDirectus, rest, authentication, readItems, createItem, updateItem, deleteItem, readMe } = require('@directus/sdk');

class DirectusService {
    constructor() {
        const directusUrl = process.env.DIRECTUS_URL;
        const staticToken = process.env.DIRECTUS_STATIC_TOKEN;

        if (!directusUrl) {
            console.error('❌ DIRECTUS_URL is missing in .env - Directus features will not work');
            this.client = null;
            return;
        }

        if (!staticToken) {
            console.warn('⚠️ DIRECTUS_STATIC_TOKEN is missing in .env');
        }

        this.client = createDirectus(directusUrl)
            .with(authentication())
            .with(rest());

        if (staticToken) {
            this.client.setToken(staticToken);
        }
    }

    // ==================== USER METHODS ====================

    async getUserByEmail(email) {
        try {
            const users = await this.client.request(
                readItems('forma_ext_trees_users', {
                    filter: { email: { _eq: email } },
                    limit: 1
                })
            );
            return users[0] || null;
        } catch (error) {
            console.error('Error fetching user by email:', error);
            throw error;
        }
    }

    async getUserById(id) {
        try {
            const user = await this.client.request(
                readItems('forma_ext_trees_users', {
                    filter: { id: { _eq: id } },
                    limit: 1
                })
            );
            return user[0] || null;
        } catch (error) {
            console.error('Error fetching user by id:', error);
            throw error;
        }
    }

    async createUser(userData) {
        try {
            return await this.client.request(
                createItem('forma_ext_trees_users', userData)
            );
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    // ==================== USER-PROJECT LINKING METHODS ====================

    /**
     * Add a user to a project's users list (Many-to-Many)
     * Uses the junction table: forma_ext_trees_proj_forma_ext_trees_users
     */
    async addUserToProject(projectDirectusId, userDirectusId) {
        try {
            // Check if link already exists
            const existingLinks = await this.client.request(
                readItems('forma_ext_trees_proj_forma_ext_trees_users', {
                    filter: {
                        forma_ext_trees_proj_id: { _eq: projectDirectusId },
                        forma_ext_trees_users_id: { _eq: userDirectusId }
                    },
                    limit: 1
                })
            );

            if (existingLinks.length > 0) {
                console.log('User-Project link already exists');
                return existingLinks[0];
            }

            // Create the link
            return await this.client.request(
                createItem('forma_ext_trees_proj_forma_ext_trees_users', {
                    forma_ext_trees_proj_id: projectDirectusId,
                    forma_ext_trees_users_id: userDirectusId
                })
            );
        } catch (error) {
            console.error('Error adding user to project:', error);
            throw error;
        }
    }

    /**
     * Get all projects for a user via the junction table
     */
    async getProjectsForUser(userDirectusId) {
        try {
            // Get all project IDs linked to this user
            const links = await this.client.request(
                readItems('forma_ext_trees_proj_forma_ext_trees_users', {
                    filter: {
                        forma_ext_trees_users_id: { _eq: userDirectusId }
                    }
                })
            );

            if (links.length === 0) return [];

            // Get the actual project records
            const projectIds = links.map(l => l.forma_ext_trees_proj_id);
            const projects = await this.client.request(
                readItems('forma_ext_trees_proj', {
                    filter: {
                        id: { _in: projectIds }
                    },
                    sort: ['-date_updated']
                })
            );

            return projects;
        } catch (error) {
            console.error('Error fetching projects for user:', error);
            throw error;
        }
    }

    // ==================== PASSWORD RESET METHODS ====================

    async getUserByResetToken(token) {
        try {
            const users = await this.client.request(
                readItems('forma_ext_trees_users', {
                    filter: { reset_token: { _eq: token } },
                    limit: 1
                })
            );
            return users[0] || null;
        } catch (error) {
            console.error('Error fetching user by reset token:', error);
            throw error;
        }
    }

    async updateUserResetToken(userId, resetToken, resetTokenExpiry) {
        try {
            return await this.client.request(
                updateItem('forma_ext_trees_users', userId, {
                    reset_token: resetToken,
                    reset_token_expiry: resetTokenExpiry
                })
            );
        } catch (error) {
            console.error('Error updating user reset token:', error);
            throw error;
        }
    }

    async updateUserPassword(userId, newPassword) {
        try {
            // Update password and clear reset token
            // Directus will hash the password automatically
            return await this.client.request(
                updateItem('forma_ext_trees_users', userId, {
                    password: newPassword,
                    reset_token: null,
                    reset_token_expiry: null
                })
            );
        } catch (error) {
            console.error('Error updating user password:', error);
            throw error;
        }
    }

    async triggerPasswordResetEmail(email, resetToken) {
        const { sendPasswordResetEmail } = require('./email');
        
        const resetUrl = `${process.env.APP_URL || 'http://localhost:3001'}/reset-password.html?token=${resetToken}`;
        
        console.log('=== PASSWORD RESET ===');
        console.log('Email:', email);
        console.log('Reset URL:', resetUrl);
        
        // Send email using nodemailer
        try {
            await sendPasswordResetEmail(email, resetUrl);
            return { email, resetUrl, emailSent: true };
        } catch (error) {
            console.error('Failed to send email, but token was created:', error.message);
            // Still return success - the token was created, email just failed
            return { email, resetUrl, emailSent: false };
        }
    }

    // ==================== PROJECT METHODS ====================

    /**
     * Get a project by its Forma project ID (e.g., "pro_xyz123")
     */
    async getProjectByFormaId(formaProjectId) {
        try {
            const projects = await this.client.request(
                readItems('forma_ext_trees_proj', {
                    filter: { porject_id: { _eq: formaProjectId } },
                    limit: 1
                })
            );
            return projects[0] || null;
        } catch (error) {
            console.error('Error fetching project by Forma ID:', error);
            throw error;
        }
    }

    /**
     * Create or update a project, and link the user to it
     * @param {Object} projectData - { formaProjectId, name, coordinates, size }
     * @param {string} userDirectusId - The Directus UUID of the user
     * @returns {Object} - { project, isNew, userLinked }
     */
    async upsertProject(projectData, userDirectusId) {
        try {
            const { formaProjectId, name, coordinates, size } = projectData;
            
            // Check if project already exists
            let project = await this.getProjectByFormaId(formaProjectId);
            let isNew = false;

            if (!project) {
                // Create new project
                console.log('Creating new project:', formaProjectId);
                project = await this.client.request(
                    createItem('forma_ext_trees_proj', {
                        porject_id: formaProjectId,
                        name: name, // Project name from Forma
                        coordinates: coordinates, // "[longitude, latitude]" as string
                        size: size // "4951m × 4886m"
                    })
                );
                isNew = true;
            } else {
                console.log('Project already exists:', formaProjectId);
                
                // Update the project name if it's missing or different
                if (name && (!project.name || project.name !== name)) {
                    console.log('Updating project name:', name);
                    project = await this.client.request(
                        updateItem('forma_ext_trees_proj', project.id, {
                            name: name
                        })
                    );
                }
            }

            // Link user to project (if not already linked)
            let userLinked = false;
            if (userDirectusId && project.id) {
                await this.addUserToProject(project.id, userDirectusId);
                userLinked = true;
            }

            return { project, isNew, userLinked };
        } catch (error) {
            console.error('Error upserting project:', error);
            throw error;
        }
    }

    async getUserProjects(userEmail) {
        try {
            // First find the user to get their ID
            const user = await this.getUserByEmail(userEmail);
            if (!user) return [];

            // Use the junction table method
            return await this.getProjectsForUser(user.id);
        } catch (error) {
            console.error('Error fetching user projects:', error);
            throw error;
        }
    }

    async getProject(projectId) {
        try {
            return await this.client.request(
                readItems('forma_ext_trees_proj', {
                    filter: { id: { _eq: projectId } },
                    limit: 1
                })
            ).then(items => items[0] || null);
        } catch (error) {
            console.error('Error fetching project:', error);
            throw error;
        }
    }

    async createProject(projectData) {
        try {
            return await this.client.request(
                createItem('forma_ext_trees_proj', projectData)
            );
        } catch (error) {
            console.error('Error creating project:', error);
            throw error;
        }
    }

    async updateProject(projectId, projectData) {
        try {
            return await this.client.request(
                updateItem('forma_ext_trees_proj', projectId, projectData)
            );
        } catch (error) {
            console.error('Error updating project:', error);
            throw error;
        }
    }

    async deleteProject(projectId) {
        try {
            return await this.client.request(
                deleteItem('forma_ext_trees_proj', projectId)
            );
        } catch (error) {
            console.error('Error deleting project:', error);
            throw error;
        }
    }
}

module.exports = new DirectusService();
