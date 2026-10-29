import { ResumeData, DEFAULT_SECTION_ORDER } from '../src/types';
import { JAVA_JD, REACT_JD, makeMasterCV } from './fixtures';

export { JAVA_JD, REACT_JD, makeMasterCV };

export const CLOUD_PLATFORM_JD = `Senior Cloud Platform Engineer

FinScale Infrastructure is hiring a Senior Cloud Platform Engineer in London (Hybrid) to scale our multi-region Kubernetes platform and infrastructure-as-code automation.

About the Role:
You will build, automate, and operate enterprise cloud infrastructure on AWS, ensuring high availability, continuous delivery, and infrastructure security for financial microservices.

Key Responsibilities:
- Design, provision, and maintain cloud infrastructure using Terraform and AWS (EKS, RDS, VPC, IAM)
- Manage production Kubernetes clusters (EKS) with Helm, ArgoCD, and GitOps workflows
- Build automated CI/CD pipelines with GitHub Actions and Docker
- Implement observability and alerting using Prometheus, Grafana, and OpenTelemetry
- Ensure infrastructure security, compliance, and automated patching
- Collaborate with software engineering teams to optimize cloud resource efficiency and reliability

Requirements:
- 4+ years of professional experience in cloud engineering, DevOps, or site reliability engineering
- Strong hands-on experience with AWS and Terraform infrastructure-as-code
- Production experience deploying and operating Kubernetes (EKS) clusters
- Solid Linux systems administration, bash scripting, and Python or Go automation
- Experience with CI/CD tools (GitHub Actions, GitLab CI, or Jenkins)
- Experience configuring Prometheus and Grafana monitoring stacks

Nice to Have:
- AWS Certified Solutions Architect or CKA (Certified Kubernetes Administrator)
- Experience with Service Mesh (Istio) or HashiCorp Vault
- Background in financial services or regulated environments`;

export function makeCloudMasterCV(): ResumeData {
  return {
    personal: {
      fullName: 'Elena Rostova',
      email: 'elena.rostova@example.com',
      phone: '+44 7700 900456',
      location: 'London, UK',
      linkedin: 'linkedin.com/in/elenarostova',
      github: 'github.com/elenarostova',
      portfolio: '',
      headline: 'Cloud & DevOps Engineer',
    },
    summary:
      'Cloud and DevOps Engineer with 4 years experience architecting AWS infrastructure and Kubernetes clusters. Automated infrastructure delivery using Terraform and built CI/CD pipelines reducing deployment failure rate by 45%.',
    experience: [
      {
        id: 'exp_cloud_1',
        company: 'Vanguard Cloud Systems',
        title: 'Platform Engineer',
        location: 'London',
        startDate: '01/2022',
        endDate: 'Present',
        current: true,
        bullets: [
          'Provisioned multi-region AWS cloud infrastructure using Terraform modules handling 15M monthly requests.',
          'Operated production Kubernetes clusters on AWS EKS with Helm charts and automated zero-downtime rollouts.',
          'Built end-to-end CI/CD pipelines with GitHub Actions and Docker, reducing build times from 35 minutes to 7 minutes.',
          'Configured Prometheus and Grafana telemetry dashboards alerting on cluster node and pod performance.',
        ],
      },
      {
        id: 'exp_cloud_2',
        company: 'Apex Digital Infrastructure',
        title: 'Junior DevOps Engineer',
        location: 'Cambridge',
        startDate: '09/2020',
        endDate: '12/2021',
        current: false,
        bullets: [
          'Maintained Ubuntu Linux server fleet and authored Python automation scripts for scheduled log backups.',
          'Assisted migration of legacy monolithic workloads to Docker containers on AWS ECS.',
          'Monitored system availability and resolved infrastructure incidents with 99.9% uptime SLA.',
        ],
      },
    ],
    projects: [
      {
        id: 'prj_cloud_1',
        name: 'KubeGitOps-Bootstrap',
        link: 'github.com/elenarostova/kubegitops-bootstrap',
        description: 'Open source GitOps bootstrap repository for multi-cluster EKS.',
        bullets: [
          'Implemented Terraform templates for automated VPC, subnets, and EKS cluster provisioning with IAM authentication.',
        ],
        tech: ['Terraform', 'AWS', 'Kubernetes', 'Helm', 'Bash'],
      },
    ],
    education: [
      {
        id: 'edu_cloud_1',
        institution: 'Imperial College London',
        degree: 'BEng',
        field: 'Software Engineering',
        startDate: '2017',
        endDate: '2020',
        grade: 'First Class Honours',
      },
    ],
    skills: {
      technical: [
        'AWS',
        'Kubernetes',
        'Terraform',
        'Docker',
        'Linux',
        'CI/CD',
        'GitHub Actions',
        'Prometheus',
        'Grafana',
        'Python',
        'Bash',
        'Helm',
        'Git',
      ],
      soft: ['Incident Management', 'Cross-team Collaboration', 'Mentorship', 'Technical Documentation'],
    },
    certifications: [
      { id: 'cert_cloud_1', name: 'AWS Certified Solutions Architect – Associate', issuer: 'Amazon Web Services', year: '2022' },
      { id: 'cert_cloud_2', name: 'Certified Kubernetes Administrator (CKA)', issuer: 'Cloud Native Computing Foundation', year: '2023' },
    ],
    languages: [
      { id: 'lang_cloud_1', name: 'English', proficiency: 'Fluent' },
    ],
    achievements: [
      'Authored internal Terraform best-practices standard adopted by 40+ engineers across 6 platform squads.',
    ],
    customSections: [],
    hiddenSections: [],
    sectionOrder: [...DEFAULT_SECTION_ORDER],
  };
}

export function makeReactMasterCV(): ResumeData {
  return {
    personal: {
      fullName: 'Marcus Chen',
      email: 'marcus.chen@example.com',
      phone: '+44 7700 900789',
      location: 'Bristol, UK',
      linkedin: 'linkedin.com/in/marcuschen',
      github: 'github.com/marcuschen',
      portfolio: 'https://marcuschen.dev',
      headline: 'Full Stack Frontend Developer',
    },
    summary:
      'Frontend-focused full stack developer with 3 years of commercial experience creating accessible, high-performance web applications using React, TypeScript, and modern CSS. Improved core web vitals and user conversion across enterprise client applications.',
    experience: [
      {
        id: 'exp_react_1',
        company: 'Synthetix Web Studio',
        title: 'Frontend Developer',
        location: 'Bristol',
        startDate: '03/2022',
        endDate: 'Present',
        current: true,
        bullets: [
          'Engineered responsive customer web applications in React 18, TypeScript, and Tailwind CSS serving 80,000 active users.',
          'Architected global client state management using Redux Toolkit, eliminating prop drilling and reducing re-renders by 35%.',
          'Integrated secure RESTful APIs and WebSockets to deliver real-time data feeds and live user notifications.',
          'Implemented comprehensive unit and component test suites with Jest and React Testing Library maintaining 88% test coverage.',
        ],
      },
      {
        id: 'exp_react_2',
        company: 'Pulse Digital Agency',
        title: 'Junior Web Developer',
        location: 'Bath',
        startDate: '07/2021',
        endDate: '02/2022',
        current: false,
        bullets: [
          'Developed pixel-perfect marketing landing pages and client dashboards using HTML5, CSS3, JavaScript, and React.',
          'Audited client websites for WCAG 2.1 AA accessibility compliance and fixed keyboard navigation issues.',
        ],
      },
    ],
    projects: [
      {
        id: 'prj_react_1',
        name: 'DesignSystem-Kit',
        link: 'github.com/marcuschen/designsystem-kit',
        description: 'Accessible component library built with React, TypeScript, and Tailwind.',
        bullets: [
          'Created 24 accessible UI components documented in Storybook with 100% keyboard accessibility.',
        ],
        tech: ['React', 'TypeScript', 'Tailwind CSS', 'Storybook', 'Jest'],
      },
    ],
    education: [
      {
        id: 'edu_react_1',
        institution: 'University of Bristol',
        degree: 'BSc',
        field: 'Computer Science',
        startDate: '2018',
        endDate: '2021',
        grade: 'Upper Second Class (2:1)',
      },
    ],
    skills: {
      technical: [
        'React',
        'TypeScript',
        'JavaScript',
        'Redux',
        'Tailwind CSS',
        'HTML5',
        'CSS3',
        'REST APIs',
        'WebSockets',
        'Jest',
        'React Testing Library',
        'Git',
        'Accessibility (WCAG)',
      ],
      soft: ['Agile Collaboration', 'Design System Architecture', 'Code Review', 'User Empathy'],
    },
    certifications: [
      { id: 'cert_react_1', name: 'Meta Front-End Developer Professional Certificate', issuer: 'Meta', year: '2022' },
    ],
    languages: [
      { id: 'lang_react_1', name: 'English', proficiency: 'Native' },
    ],
    achievements: [
      'Speaker at Bristol JS Meetup 2023 on building accessible stateful forms in React.',
    ],
    customSections: [],
    hiddenSections: [],
    sectionOrder: [...DEFAULT_SECTION_ORDER],
  };
}
