// Project Data Service - Handles all project-related data operations
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ProjectService {
  cache: any;
  isInitialized: boolean;

  constructor() {
    this.cache = {
      projects: [],
      groups: {},
      tasks: {},
      lastSync: null
    };
    this.isInitialized = false;
  }

  // Get authentication token
  getToken() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found in localStorage');
      throw new Error('No authentication token found');
    }
    console.log('Token found:', token.substring(0, 20) + '...');
    return token;
  }

  // Make API call with comprehensive error handling
  async apiCall(endpoint: string, options: any = {}) {
    const token = this.getToken();
    
    console.log(`Making API call to: ${API_BASE_URL}${endpoint}`);
    console.log('Request options:', options);
    
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers
        }
      });
      
      console.log(`API response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API call failed: ${response.status} ${response.statusText}`, errorText);
        if (response.status === 401) {
          localStorage.removeItem('token');
          if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
            window.location.href = '/';
          }
          throw new Error('Your session has expired. Please sign in again.');
        }
        if (response.status === 403) {
          throw new Error(errorText || 'You do not have permission to perform this action.');
        }
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`API response data:`, data);
      return data;
    } catch (error) {
      console.error(`API call error:`, error);
      throw error;
    }
  }

  // Load all projects with detailed logging
  async loadProjects() {
    try {
      console.log(' Loading projects from API...');
      const data = await this.apiCall('/projects');
      
      this.cache.projects = data.projects || [];
      this.cache.lastSync = Date.now();
      
      console.log(` Projects loaded and cached: ${this.cache.projects.length} projects`);
      console.log(' Project list:', this.cache.projects.map((p: any) => ({ id: p.id, name: p.name })));
      
      return this.cache.projects;
    } catch (error) {
      console.error(' Error loading projects:', error);
      throw error;
    }
  }

  // Load groups for a project with detailed logging
  async loadGroups(projectId: any) {
    try {
      console.log(` Loading groups for project ${projectId}...`);
      const data = await this.apiCall(`/projects/${projectId}/groups`);
      
      this.cache.groups[projectId] = data.groups || [];
      
      console.log(` Groups loaded for project ${projectId}: ${this.cache.groups[projectId].length} groups`);
      console.log(' Group list:', this.cache.groups[projectId].map((g: any) => ({ id: g.id, name: g.name })));
      
      return this.cache.groups[projectId];
    } catch (error) {
      console.error(` Error loading groups for project ${projectId}:`, error);
      throw error;
    }
  }

  // Load tasks for a group with detailed logging
  async loadTasks(groupId: any) {
    try {
      console.log(` Loading tasks for group ${groupId}...`);
      const data = await this.apiCall(`/groups/${groupId}/tasks`);
      
      this.cache.tasks[groupId] = data.tasks || [];
      
      console.log(` Tasks loaded for group ${groupId}: ${this.cache.tasks[groupId].length} tasks`);
      console.log(' Task list:', this.cache.tasks[groupId].map((t: any) => ({ id: t.id, title: t.title })));
      
      return this.cache.tasks[groupId];
    } catch (error) {
      console.error(` Error loading tasks for group ${groupId}:`, error);
      throw error;
    }
  }

  // Load complete project data (projects + groups + tasks)
  async loadCompleteProjectData() {
    try {
      console.log(' Loading complete project data...');
      
      // Load projects first
      const projects = await this.loadProjects();
      
      if (projects.length === 0) {
        // Check if user has manually deleted projects before
        const hasUserDeletedProjects = localStorage.getItem('userDeletedProjects') === 'true';
        
        if (!hasUserDeletedProjects) {
          console.log(' No projects found, creating default projects for new user...');
          return await this.createDefaultProjects();
        } else {
          console.log(' No projects found, but user has previously deleted projects. Not creating defaults.');
          return [];
        }
      }
      
      // Load groups and tasks for each project
      for (const project of projects) {
        console.log(` Loading data for project: ${project.name} (ID: ${project.id})`);
        
        try {
          const groups = await this.loadGroups(project.id);
          
          // Load tasks for each group
          for (const group of groups) {
            console.log(` Loading tasks for group: ${group.name} (ID: ${group.id})`);
            await this.loadTasks(group.id);
          }
        } catch (error) {
          console.error(` Error loading data for project ${project.id}:`, error);
        }
      }
      
      console.log(' Complete project data loaded successfully');
      console.log(' Data summary:', {
        projects: this.cache.projects.length,
        groups: Object.keys(this.cache.groups).length,
        tasks: Object.keys(this.cache.tasks).length
      });
      
      return this.cache.projects;
    } catch (error) {
      console.error(' Error loading complete project data:', error);
      throw error;
    }
  }

  // Create a new project
  async createProject(name: string, notes: string = '') {
    try {
      console.log(` Creating project: ${name}`);
      const data = await this.apiCall('/projects', {
        method: 'POST',
        body: JSON.stringify({ name, notes })
      });
      
      this.cache.projects.push(data.project);
      console.log(' Project created:', data.project);
      return data.project;
    } catch (error) {
      console.error(' Error creating project:', error);
      throw error;
    }
  }

  // Create a new group
  async createGroup(projectId: any, name: string, color: string = '#238636') {
    try {
      console.log(` Creating group: ${name} for project ${projectId}`);
      const data = await this.apiCall(`/projects/${projectId}/groups`, {
        method: 'POST',
        body: JSON.stringify({ name, color })
      });
      
      if (!this.cache.groups[projectId]) {
        this.cache.groups[projectId] = [];
      }
      this.cache.groups[projectId].push(data.group);
      console.log(' Group created:', data.group);
      return data.group;
    } catch (error) {
      console.error(' Error creating group:', error);
      throw error;
    }
  }

  // Create a new task
  async createTask(groupId: any, title: string, assignee: string = 'Unassigned', status: string = 'Not started', date: string = 'Today') {
    try {
      console.log(` Creating task: ${title} for group ${groupId}`);
      const data = await this.apiCall(`/groups/${groupId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ title, assignee, status, date })
      });
      
      if (!this.cache.tasks[groupId]) {
        this.cache.tasks[groupId] = [];
      }
      this.cache.tasks[groupId].push(data.task);
      console.log(' Task created:', data.task);
      return data.task;
    } catch (error) {
      console.error(' Error creating task:', error);
      throw error;
    }
  }

  // Update a task
  async updateTask(taskId: any, updates: any) {
    try {
      console.log(` Updating task ${taskId}:`, updates);
      await this.apiCall(`/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });

      // Update cache
      Object.keys(this.cache.tasks).forEach(groupId => {
        this.cache.tasks[groupId] = this.cache.tasks[groupId].map((task: any) =>
          task.id === taskId ? { ...task, ...updates } : task
        );
      });
      
      console.log(' Task updated:', taskId, updates);
    } catch (error) {
      console.error(' Error updating task:', error);
      throw error;
    }
  }

  // Delete a task
  async deleteTask(taskId: any) {
    try {
      console.log(` Deleting task ${taskId}`);
      await this.apiCall(`/tasks/${taskId}`, {
        method: 'DELETE'
      });

      // Update cache
      Object.keys(this.cache.tasks).forEach(groupId => {
        this.cache.tasks[groupId] = this.cache.tasks[groupId].filter((task: any) => task.id !== taskId);
      });
      
      console.log(' Task deleted:', taskId);
    } catch (error) {
      console.error(' Error deleting task:', error);
      throw error;
    }
  }

  // Update group name
  async updateGroupName(groupId: any, name: string) {
    try {
      console.log(` Updating group name ${groupId} to: ${name}`);
      await this.apiCall(`/groups/${groupId}`, {
        method: 'PUT',
        body: JSON.stringify({ name })
      });

      // Update cache
      Object.keys(this.cache.groups).forEach(projectId => {
        this.cache.groups[projectId] = this.cache.groups[projectId].map((group: any) =>
          group.id === groupId ? { ...group, name } : group
        );
      });
      
      console.log(' Group name updated:', groupId, name);
    } catch (error) {
      console.error(' Error updating group name:', error);
      throw error;
    }
  }

  async deleteProject(projectId: any) {
    try {
      console.log(` Deleting project: ${projectId}`);

      await this.apiCall(`/projects/${projectId}`, {
        method: 'DELETE'
      });

      console.log(' Project deleted successfully');

      // Mark that user has manually deleted projects
      localStorage.setItem('userDeletedProjects', 'true');

      // Remove from cache
      this.cache.projects = this.cache.projects.filter((p: any) => p.id !== projectId);
      delete this.cache.groups[projectId];
      
      return true;
    } catch (error) {
      console.error(' Error deleting project:', error);
      throw error;
    }
  }

  async updateProject(projectId: any, name: string, notes: string) {
    try {
      console.log(` Updating project: ${projectId} -> ${name}`);

      const updatedProject = await this.apiCall(`/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, notes })
      });

      console.log(' Project updated successfully:', updatedProject);

      // Update cache - the server only returns a message, so we need to update manually
      this.cache.projects = this.cache.projects.map((p: any) =>
        p.id === projectId ? { ...p, name, notes } : p
      );

      // Return the updated project from cache
      const updatedProjectFromCache = this.cache.projects.find((p: any) => p.id === projectId);
      return updatedProjectFromCache;
    } catch (error) {
      console.error(' Error updating project:', error);
      throw error;
    }
  }

  // Get cached data
  getCachedProjects() {
    console.log(` Returning cached projects: ${this.cache.projects.length}`);
    return this.cache.projects;
  }

  getCachedGroups(projectId: any) {
    const groups = this.cache.groups[projectId] || [];
    console.log(` Returning cached groups for project ${projectId}: ${groups.length}`);
    return groups;
  }

  getCachedTasks(groupId: any) {
    const tasks = this.cache.tasks[groupId] || [];
    console.log(` Returning cached tasks for group ${groupId}: ${tasks.length}`);
    return tasks;
  }

  // Check if data is stale (older than 5 minutes)
  isDataStale() {
    if (!this.cache.lastSync) {
      console.log(' No last sync time, data is stale');
      return true;
    }
    const isStale = Date.now() - this.cache.lastSync > 5 * 60 * 1000; // 5 minutes
    console.log(` Data stale check: ${isStale ? 'STALE' : 'FRESH'} (last sync: ${new Date(this.cache.lastSync).toLocaleTimeString()})`);
    return isStale;
  }

  // Force refresh all data
  async refreshAllData() {
    console.log(' Force refreshing all data...');
    this.cache = { projects: [], groups: {}, tasks: {}, lastSync: null };
    return await this.loadCompleteProjectData();
  }

  // Create default projects if none exist
  async createDefaultProjects() {
    try {
      console.log(' Creating default projects...');
      
      // Create Project 1
      const project1 = await this.createProject('Project 1');
      
      // Create Project 2
      const project2 = await this.createProject('Project 2');
      
      // Create Group 1 for Project 1
      const group1 = await this.createGroup(project1.id, 'Group 1', '#238636');
      
      // Create tasks for Group 1
      await this.createTask(group1.id, 'Task 1');
      await this.createTask(group1.id, 'Task 2');
      
      console.log(' Default projects created successfully');
      return this.cache.projects;
    } catch (error) {
      console.error(' Error creating default projects:', error);
      throw error;
    }
  }

  // Initialize the service
  async initialize() {
    if (this.isInitialized) {
      console.log(' Service already initialized');
      return;
    }

    try {
      console.log(' Initializing ProjectService...');
      await this.loadCompleteProjectData();
      this.isInitialized = true;
      console.log(' ProjectService initialized successfully');
    } catch (error) {
      console.error(' Error initializing ProjectService:', error);
      throw error;
    }
  }
}

// Export singleton instance
const projectService = new ProjectService();
export default projectService;

