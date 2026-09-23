// Real-world resume testing profiles
// Test: Java Backend Developer, React Frontend Developer, Cloud/DevOps Engineer, Graduate Software Engineer

// Profile 1: Java Backend Developer
const javaProfile = {
  name: 'Java Backend Developer',
  cv: {
    personal: {
      fullName: 'Priya Patel',
      email: 'priya.patel@email.com',
      phone: '+1 555 0101',
      location: 'San Francisco, CA',
      linkedin: 'linkedin.com/in/priyapatel',
      github: 'github.com/priyapatel',
      headline: 'Java Backend Developer'
    },
    summary: 'Backend engineer with 5 years of experience building RESTful services and microarchitectures in Java and Spring Boot. Designed payment systems handling 500k+ daily transactions. Optimized PostgreSQL and MySQL databases for high throughput. Built CI/CD pipelines with Docker and Jenkins.',
    experience: [
      {
        id: 'exp_1',
        company: 'TechCorp Industries',
        title: 'Senior Java Developer',
        location: 'San Francisco, CA',
        startDate: '06/2020',
        endDate: 'Present',
        current: true,
        bullets: [
          'Designed and implemented REST APIs with Spring Boot serving 750k daily requests',
          'Optimized PostgreSQL queries reducing average response time by 45%',
          'Built event-driven architectures using Kafka and Redis for real-time data processing',
          'Designed microservices architecture using Docker and Kubernetes, reducing deployment time from 30 minutes to 3 minutes',
          'Led code reviews and mentored junior developers on Spring best practices'
        ]
      },
      {
        id: 'exp_2',
        company: 'DataFlow Systems',
        title: 'Java Developer',
        location: 'Austin, TX',
        startDate: '01/2019',
        endDate: '05/2020',
        current: false,
        bullets: [
          'Developed Java microservices using Spring Boot and Cloud Stream',
          'Implemented Redis caching reducing database load by 60%',
          'Wrote unit and integration tests achieving 85% code coverage',
          'Participated in Agile ceremonies and sprint planning'
        ]
      }
    ],
    projects: [
      {
        id: 'prj_1',
        name: 'Transaction Service',
        link: 'github.com/priyapatel/transactionsvc',
        description: 'High-throughput transaction processing service',
        bullets: ['Processed 2M transactions daily with 99.99% success rate'],
        tech: ['Java', 'Spring Boot', 'PostgreSQL', 'Redis', 'Kafka']
      },
      {
        id: 'prj_2',
        name: 'Cache Service',
        link: 'github.com/priyapatel/cachesvc',
        description: 'Distributed caching layer',
        bullets: ['Built Redis-based cache reducing DB calls by 70%'],
        tech: ['Java', 'Spring', 'Redis', 'Lettuce']
      }
    ],
    education: [
      {
        id: 'edu_1',
        institution: 'Stanford University',
        degree: 'MSc',
        field: 'Computer Science',
        startDate: '2017',
        endDate: '2019',
        grade: '3.8/4.0'
      },
      {
        id: 'edu_2',
        institution: 'University of California',
        degree: 'BSc',
        field: 'Mathematics',
        startDate: '2014',
        endDate: '2017',
        grade: '3.9/4.0'
      }
    ],
    skills: {
      technical: ['Java', 'Spring Boot', 'Spring', 'PostgreSQL', 'MySQL', 'Redis', 'Kafka', 'Docker', 'Kubernetes', 'Maven', 'Gradle', 'Git', 'JUnit', 'Mockito'],
      soft: ['Leadership', 'Mentoring', 'Problem Solving', 'Communication', 'Agile Methodologies']
    },
    certifications: [
      { id: 'cert_1', name: 'Oracle Certified Professional: Java SE 11', issuer: 'Oracle', year: '2021' },
      { id: 'cert_2', name: 'AWS Certified Solutions Architect', issuer: 'AWS', year: '2022' }
    ],
    languages: [
      { id: 'lang_1', name: 'English', proficiency: 'Native' },
      { id: 'lang_2', name: 'Hindi', proficiency: 'Conversational' }
    ],
    achievements: ['Won internal hackathon 2023 with automated reconciliation prototype'],
    sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'languages', 'achievements'],
    hiddenSections: []
  }
};

// Profile 2: React Frontend Developer
const reactProfile = {
  name: 'React Frontend Developer',
  cv: {
    personal: {
      fullName: 'Marcus Chen',
      email: 'marc.chen@email.com',
      phone: '+1 555 0102',
      location: 'New York, NY',
      linkedin: 'linkedin.com/in/marcuschen',
      github: 'github.com/mchen',
      headline: 'Frontend Engineer'
    },
    summary: 'Frontend engineer with 4 years of experience building accessible, high-performance web applications with React, TypeScript, and Tailwind CSS. Improved Core Web Vitals across three products and led adoption of shared design system.',
    experience: [
      {
        id: 'exp_1',
        company: 'WebSolutions Inc.',
        title: 'Frontend Engineer',
        location: 'New York, NY',
        startDate: '09/2020',
        endDate: 'Present',
        current: true,
        bullets: [
          'Built responsive interfaces with React and TypeScript used by 300k monthly users',
          'Reduced bundle size by 45% and improved Lighthouse scores from 55 to 95',
          'Created reusable component library with Storybook, reducing duplicate code by 60%',
          'Collaborated with designers on accessible WCAG AA-compliant interfaces',
          'Wrote unit tests with Jest and integration tests with React Testing Library'
        ]
      },
      {
        id: 'exp_2',
        company: 'DigitalPortal Co.',
        title: 'Junior Frontend Developer',
        location: 'Boston, MA',
        startDate: '06/2019',
        endDate: '08/2020',
        current: false,
        bullets: [
          'Implemented UI components with React and Redux Toolkit',
          'Integrated REST APIs using Axios and SWR for data fetching',
          'Fixed browser compatibility issues across Chrome, Firefox, and Safari'
        ]
      }
    ],
    projects: [
      {
        id: 'prj_1',
        name: 'Admin Dashboard',
        link: 'github.com/mchen/admin-dashboard',
        description: 'Employee management dashboard',
        bullets: ['Built responsive dashboard with real-time analytics, 5k active users'],
        tech: ['React', 'TypeScript', 'Redux Toolkit', 'Chart.js', 'Tailwind CSS']
      },
      {
        id: 'prj_2',
        name: 'E-commerce Site',
        link: 'github.com/mchen/ecommerce',
        description: 'Online store frontend',
        bullets: ['Implemented product filter and search, 2k orders first month'],
        tech: ['React', 'TypeScript', 'Redux', 'Stripe API', 'GraphQL']
      }
    ],
    education: [
      {
        id: 'edu_1',
        institution: 'MIT',
        degree: 'BS',
        field: 'Computer Science',
        startDate: '2016',
        endDate: '2020',
        grade: '3.7/4.0'
      }
    ],
    skills: {
      technical: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Redux', 'Tailwind CSS', 'Storybook', 'Jest', 'Cypress', 'Git'],
      soft: ['Communication', 'Teamwork', 'Creative Problem Solving', 'Design Sensitivity']
    },
    certifications: [
      { id: 'cert_1', name: 'React Developer Certificate', issuer: 'freeCodeCamp', year: '2021' }
    ],
    languages: [
      { id: 'lang_1', name: 'English', proficiency: 'Native' },
      { id: 'lang_2', name: 'Spanish', proficiency: 'Basic' }
    ],
    achievements: ['Speak at React Meetup 2023 about accessible components']
  }
};

// Profile 3: Cloud/DevOps Engineer
const cloudProfile = {
  name: 'Cloud/DevOps Engineer',
  cv: {
    personal: {
      fullName: 'Elena Rodriguez',
      email: 'elena.rodriguez@email.com',
      phone: '+1 555 0103',
      location: 'Austin, TX',
      linkedin: 'linkedin.com/in/elenarodriguez',
      github: 'github.com/elerodriguez',
      headline: 'Cloud DevOps Engineer'
    },
    summary: 'DevOps engineer with 6 years of experience designing CI/CD pipelines, managing Kubernetes clusters, and optimizing cloud infrastructure on AWS and Azure. Focused on infrastructure as code, automation, and reliability engineering.',
    experience: [
      {
        id: 'exp_1',
        company: 'CloudScale Labs',
        title: 'DevOps Engineer',
        location: 'Austin, TX',
        startDate: '03/2019',
        endDate: 'Present',
        current: true,
        bullets: [
          'Designed and maintained Kubernetes clusters managing 200+ production workloads',
          'Built CI/CD pipelines with GitHub Actions and Argo CD, reducing deployment time from 4 hours to 15 minutes',
          'Implemented infrastructure as code with Terraform and OpenTofu, managing 50+ AWS and Azure resources',
          'Set up monitoring and alerting with Prometheus and Grafana, reducing MTTR by 70%',
          'Automated security scanning and compliance checks across all environments'
        ]
      },
      {
        id: 'exp_2',
        company: 'DataCorp',
        title: 'Site Reliability Engineer',
        location: 'Portland, OR',
        startDate: '01/2018',
        endDate: '02/2019',
        current: false,
        bullets: [
          'Managed AWS infrastructure for 10+ production applications',
          'Implemented automated backup and disaster recovery procedures',
          'Reduced infrastructure costs by 30% through resource optimization',
          'Conducted chaos engineering experiments to improve system resilience'
        ]
      }
    ],
    projects: [
      {
        id: 'prj_1',
        name: 'Platform Migration',
        link: 'github.com/elerodriguez/platform-migration',
        description: 'Migrated 20+ applications to Kubernetes',
        bullets: ['Migrated from EC2 to EKS, improved cost efficiency by 40%'],
        tech: ['Kubernetes', 'EKS', 'Terraform', 'Helm', 'AWS', 'Azure']
      },
      {
        id: 'prj_2',
        name: 'Observability Stack',
        link: 'github.com/elerodriguez/observability',
        description: 'Monitoring and logging platform',
        bullets: ['Built Prometheus/Grafana stack with 99.9% availability'],
        tech: ['Prometheus', 'Grafana', 'Loki', 'Promtail', 'AWS']
      }
    ],
    education: [
      {
        id: 'edu_1',
        institution: 'University of Texas',
        degree: 'BS',
        field: 'Information Systems',
        startDate: '2015',
        endDate: '2018',
        grade: '3.5/4.0'
      }
    ],
    skills: {
      technical: ['AWS', 'Azure', 'Kubernetes', 'Docker', 'Terraform', 'Helm', 'Python', 'Bash', 'Git', 'Jenkins', 'GitHub Actions', 'Argo CD', 'Prometheus', 'Grafana', 'ELK', 'Terragrunt'],
      soft: ['Communication', 'Cross-functional collaboration', 'Incident management', 'Root cause analysis']
    },
    certifications: [
      { id: 'cert_1', name: 'AWS Certified Solutions Architect - Associate', issuer: 'AWS', year: '2020' },
      { id: 'cert_2', name: 'Certified Kubernetes Administrator', issuer: 'CNCF', year: '2021' },
      { id: 'cert_3', name: 'HashiCorp Certified: Terraform Associate', issuer: 'HashiCorp', year: '2022' }
    ],
    languages: [
      { id: 'lang_1', name: 'English', proficiency: 'Native' },
      { id: 'lang_2', name: 'Spanish', proficiency: 'Conversational' },
      { id: 'lang_3', name: 'French', proficiency: 'Basic' }
    ],
    achievements: ['Reduced cloud costs by $50K annually through infrastructure optimization']
  }
};

// Profile 4: Graduate Software Engineer
const gradProfile = {
  name: 'Graduate Software Engineer',
  cv: {
    personal: {
      fullName: 'Jordan Wilson',
      email: 'jordan.wilson@email.com',
      phone: '+1 555 0104',
      location: 'Boston, MA',
      linkedin: 'linkedin.com/in/jordanwilson',
      github: 'github.com/jordanwilson',
      headline: 'Graduate Software Engineer'
    },
    summary: 'Computer Science graduate with internship experience building web applications with Python and JavaScript. Developed full-stack applications and contributed to open-source projects. Strong foundation in data structures, algorithms, and software engineering principles.',
    experience: [
      {
        id: 'exp_1',
        company: 'TechStart Labs',
        title: 'Software Engineering Intern',
        location: 'Boston, MA',
        startDate: '06/2024',
        endDate: '08/2024',
        current: false,
        bullets: [
          'Built responsive web applications with React and TypeScript',
          'Implemented REST APIs with Node.js and Express',
          'Wrote unit tests and participated in code reviews',
          'Collaborated with mentors to debug and resolve issues'
        ]
      },
      {
        id: 'exp_2',
        company: 'Campus Computing',
        title: 'Student Developer',
        location: 'Boston, MA',
        startDate: '01/2023',
        endDate: '05/2024',
        current: false,
        bullets: [
          'Developed Flask-based web applications for university departments',
          'Created database schemas with PostgreSQL',
          'Contributed to open-source Python library',
          'Participated in hackathon, built task management web app'
        ]
      }
    ],
    projects: [
      {
        id: 'prj_1',
        name: 'Task Manager',
        link: 'github.com/jordanwilson/taskmanager',
        description: 'Web-based task management application',
        bullets: ['Built full-stack app with React, Node.js, and PostgreSQL, 200+ users'],
        tech: ['React', 'TypeScript', 'Node.js', 'Express', 'PostgreSQL', 'Python']
      },
      {
        id: 'prj_2',
        name: 'Study Buddy',
        link: 'github.com/jordanwilson/studybuddy',
        description: 'Collaborative study planning app',
        bullets: ['Built real-time collaboration features with Socket.io'],
        tech: ['React', 'Socket.io', 'Flask', 'PostgreSQL']
      }
    ],
    education: [
      {
        id: 'edu_1',
        institution: 'Boston University',
        degree: 'BS',
        field: 'Computer Science',
        startDate: '2020',
        endDate: '2024',
        grade: '3.6/4.0'
      }
    ],
    skills: {
      technical: ['Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Express', 'Flask', 'PostgreSQL', 'Git', 'Docker'],
      soft: ['Communication', 'Teamwork', 'Time Management', 'Adaptability']
    },
    certifications: [],
    languages: [
      { id: 'lang_1', name: 'English', proficiency: 'Native' },
      { id: 'lang_2', name: 'Spanish', proficiency: 'Basic' }
    ],
    achievements: []
  }
};

console.log('Real-world resume profiles defined:', javaProfile.name, reactProfile.name, cloudProfile.name, gradProfile.name);