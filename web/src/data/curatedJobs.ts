// Curevo AI — Curated Benchmark Job Postings
// Realistic industry benchmark job descriptions across core engineering and tech disciplines.
// Used for deterministic exploration, transparent ATS matching, and local application tracking.
// Transparently labeled as curated benchmark roles (never fabricated live listings).

export interface CuratedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  employment_type: 'Full-time' | 'Contract' | 'Part-time';
  remote_type: 'remote' | 'hybrid' | 'on-site';
  url: string;
  source: string;
  posted_at: string;
  description: string;
  requirements: string;
  technologies: string[];
}

export const CURATED_JOBS: CuratedJob[] = [
  {
    id: 'job-curated-1',
    title: 'Senior Full-Stack Engineer',
    company: 'Apex Cloud Systems',
    location: 'London, UK',
    salary: '£85,000 - £105,000',
    employment_type: 'Full-time',
    remote_type: 'hybrid',
    url: 'https://example.com/careers/senior-fullstack-apex',
    source: 'Curated Benchmark',
    posted_at: '2 days ago',
    description: `Apex Cloud Systems is looking for a Senior Full-Stack Engineer to architect resilient customer-facing web applications and backend API services.
You will lead full-stack features from initial database schema design to responsive React UI delivery, collaborating with product managers and site reliability engineers.`,
    requirements: `• 5+ years building production web applications using React, TypeScript, and Node.js.
• Strong experience designing relational schemas in PostgreSQL and optimizing complex queries.
• Hands-on proficiency with Docker containerization, RESTful APIs, and microservices architecture.
• Experience writing comprehensive automated tests (Vitest, Jest, Playwright).
• Excellent communication skills and passion for mentoring junior engineers.`,
    technologies: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'REST APIs', 'Tailwind CSS', 'Vitest'],
  },
  {
    id: 'job-curated-2',
    title: 'Lead Backend Engineer (Go / Distributed Systems)',
    company: 'Veloce Data Labs',
    location: 'San Francisco, CA',
    salary: '$175,000 - $210,000',
    employment_type: 'Full-time',
    remote_type: 'remote',
    url: 'https://example.com/careers/lead-backend-veloce',
    source: 'Curated Benchmark',
    posted_at: '3 days ago',
    description: `Join Veloce Data Labs to build high-throughput, low-latency streaming infrastructure processing over 50,000 events per second.
You will architect distributed microservices in Go, optimize PostgreSQL and Redis storage tiers, and ensure 99.99% service reliability.`,
    requirements: `• 6+ years of software engineering experience with strong proficiency in Go or Rust.
• Deep understanding of distributed systems fundamentals, concurrency patterns, and event streaming (Kafka/RabbitMQ).
• Proven track record tuning PostgreSQL query plans and managing Redis caching layers.
• Familiarity with Kubernetes deployment pipelines, gRPC, and OpenTelemetry observability.
• BS/MS degree in Computer Science or equivalent practical background.`,
    technologies: ['Go', 'PostgreSQL', 'Redis', 'Kafka', 'Kubernetes', 'gRPC', 'Docker', 'Distributed Systems'],
  },
  {
    id: 'job-curated-3',
    title: 'Staff Platform / DevOps Engineer',
    company: 'NorthStar Infrastructure',
    location: 'Manchester, UK',
    salary: '£90,000 - £115,000',
    employment_type: 'Full-time',
    remote_type: 'remote',
    url: 'https://example.com/careers/staff-devops-northstar',
    source: 'Curated Benchmark',
    posted_at: '1 day ago',
    description: `NorthStar is seeking a Staff DevOps / Platform Engineer to lead our multi-region cloud infrastructure transformation.
You will define infrastructure as code using Terraform, standardize GitOps delivery through ArgoCD and Kubernetes, and implement robust disaster recovery automation.`,
    requirements: `• 7+ years of experience in Site Reliability Engineering, Cloud Platform Engineering, or DevOps.
• Expert knowledge of AWS (EKS, RDS, IAM, VPC) and Terraform modular infrastructure.
• Deep hands-on experience managing production Kubernetes clusters and zero-downtime blue/green deployments.
• Strong scripting ability in Python, Bash, or Go.
• Proven track record reducing deployment lead time and building automated security guardrails.`,
    technologies: ['AWS', 'Kubernetes', 'Terraform', 'ArgoCD', 'Python', 'Docker', 'Prometheus', 'CI/CD'],
  },
  {
    id: 'job-curated-4',
    title: 'Senior Frontend Engineer (React & Design Systems)',
    company: 'Loomis Design Tech',
    location: 'New York, NY',
    salary: '$150,000 - $185,000',
    employment_type: 'Full-time',
    remote_type: 'hybrid',
    url: 'https://example.com/careers/senior-frontend-loomis',
    source: 'Curated Benchmark',
    posted_at: 'Just now',
    description: `We are looking for a Senior Frontend Engineer who cares deeply about user experience, web accessibility, and design system craftsmanship.
You will build accessible, pixel-perfect user interfaces in React and TypeScript, optimize Core Web Vitals, and maintain our enterprise component library.`,
    requirements: `• 4+ years of professional frontend development with React, TypeScript, and modern CSS (Tailwind).
• Strict dedication to WCAG 2.1 AA accessibility standards and semantic HTML.
• Experience maintaining and publishing reusable component libraries.
• Strong understanding of client-side performance profiling and bundle optimization.
• Familiarity with modern build tooling (Vite, Next.js) and state management patterns.`,
    technologies: ['React', 'TypeScript', 'Tailwind CSS', 'Next.js', 'Vite', 'Accessibility (WCAG)', 'Jest', 'UI/UX'],
  },
  {
    id: 'job-curated-5',
    title: 'Machine Learning / AI Solutions Engineer',
    company: 'Cognitive Matrix AI',
    location: 'Austin, TX',
    salary: '$165,000 - $195,000',
    employment_type: 'Full-time',
    remote_type: 'remote',
    url: 'https://example.com/careers/ml-ai-cognitive',
    source: 'Curated Benchmark',
    posted_at: '4 days ago',
    description: `Cognitive Matrix AI is seeking an applied Machine Learning Engineer to deploy grounded LLM workflows, retrieval-augmented generation (RAG) pipelines, and evaluation harnesses.
You will partner with product teams to turn cutting-edge foundation models into truthful, latency-optimized enterprise solutions.`,
    requirements: `• 3+ years implementing production ML/AI applications using Python, PyTorch, and Hugging Face.
• Practical experience architecting RAG pipelines using vector databases (pgvector, Pinecone, or Qdrant).
• Deep understanding of prompt engineering, structured JSON outputs, and hallucination guardrails.
• Solid background in backend microservice development (FastAPI or Flask) and Docker deployment.
• Strong mathematical grounding in statistics and evaluation benchmarks.`,
    technologies: ['Python', 'PyTorch', 'FastAPI', 'pgvector', 'Docker', 'LLMs', 'RAG', 'Vector Databases'],
  },
  {
    id: 'job-curated-6',
    title: 'Cloud Security Engineer (SecOps & Compliance)',
    company: 'Guardian Shield Cyber',
    location: 'Bristol, UK',
    salary: '£80,000 - £100,000',
    employment_type: 'Full-time',
    remote_type: 'hybrid',
    url: 'https://example.com/careers/cloud-security-guardian',
    source: 'Curated Benchmark',
    posted_at: '5 days ago',
    description: `Help protect critical cloud infrastructure across AWS and Kubernetes environments.
You will implement least-privilege IAM policies, automate vulnerability scanning in CI/CD pipelines, and ensure continuous adherence to SOC 2 and ISO 27001 controls.`,
    requirements: `• 4+ years specializing in cloud security, DevSecOps, or application security.
• Practical experience configuring AWS IAM, GuardDuty, Security Hub, and KMS.
• Hands-on experience with container security scanning (Trivy, Snyk) and Kubernetes network policies.
• Working knowledge of compliance frameworks including SOC 2 Type II and GDPR.
• Security certifications (AWS Certified Security, CISSP, or CKS) are highly advantageous.`,
    technologies: ['AWS Security', 'Kubernetes Security', 'Terraform', 'IAM', 'SOC 2', 'Trivy', 'Docker', 'Python'],
  },
  {
    id: 'job-curated-7',
    title: 'Lead Data Engineer (Snowflake & Pipelines)',
    company: 'OmniAnalytics Global',
    location: 'Chicago, IL',
    salary: '$155,000 - $185,000',
    employment_type: 'Full-time',
    remote_type: 'remote',
    url: 'https://example.com/careers/lead-data-engineer-omni',
    source: 'Curated Benchmark',
    posted_at: '1 week ago',
    description: `Build scalable data warehouse architectures and ELT data pipelines supporting self-serve analytics and predictive intelligence.
You will lead dbt transformations in Snowflake, orchestrate workflows using Apache Airflow, and enforce data quality testing.`,
    requirements: `• 5+ years of data engineering experience with deep SQL expertise and Python pipeline development.
• Strong production experience with Snowflake or Databricks data warehousing.
• Advanced proficiency in dbt (data build tool) for modular data modeling and testing.
• Experience managing orchestration engines like Airflow, Dagster, or Prefect.
• Strong understanding of dimensional modeling, data lineage, and schema evolution.`,
    technologies: ['Snowflake', 'dbt', 'Python', 'SQL', 'Airflow', 'PostgreSQL', 'Data Modeling', 'ETL/ELT'],
  },
  {
    id: 'job-curated-8',
    title: 'Mobile Engineer (React Native & Mobile APIs)',
    company: 'Pulse Health Technologies',
    location: 'London, UK',
    salary: '£75,000 - £95,000',
    employment_type: 'Full-time',
    remote_type: 'hybrid',
    url: 'https://example.com/careers/mobile-engineer-pulse',
    source: 'Curated Benchmark',
    posted_at: '3 days ago',
    description: `Develop intuitive cross-platform iOS and Android mobile experiences for our health tracking platform.
You will create fluid, accessible screens using React Native and TypeScript, integrate offline caching, and streamline app store release cycles.`,
    requirements: `• 3+ years developing commercial mobile applications using React Native and TypeScript.
• Solid understanding of iOS and Android native bridge architectures and performance profiling.
• Experience integrating REST and GraphQL APIs with offline-first synchronization.
• Familiarity with App Store Connect and Google Play Console release management.
• Passion for clean mobile UX, animation performance, and automated unit testing.`,
    technologies: ['React Native', 'TypeScript', 'iOS', 'Android', 'REST APIs', 'GraphQL', 'Mobile UX', 'Jest'],
  },
  {
    id: 'job-curated-9',
    title: 'Senior Frontend Contractor (React / Vite)',
    company: 'Fintech Velocity Partners',
    location: 'London, UK',
    salary: '£550 - £650 / day',
    employment_type: 'Contract',
    remote_type: 'remote',
    url: 'https://example.com/careers/react-contractor-fintech',
    source: 'Curated Benchmark',
    posted_at: '4 days ago',
    description: `6-month initial contract delivering mission-critical analytics dashboards and client onboarding interfaces.
You will write clean, accessible React and TypeScript code, optimize build performance with Vite, and establish robust test coverage.`,
    requirements: `• 5+ years of specialist React experience with TypeScript and modern state management.
• Proven track record delivering responsive dashboards under agile contract sprint cadences.
• Strong familiarity with Vite build optimization, component libraries, and Tailwind CSS.
• Immediate availability for UK-hours remote engagement.`,
    technologies: ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Vitest', 'REST APIs', 'Agile'],
  },
  {
    id: 'job-curated-10',
    title: 'Robotics & Hardware Systems Engineer',
    company: 'AeroDynamics Lab',
    location: 'Cambridge, UK',
    salary: '£65,000 - £85,000',
    employment_type: 'Full-time',
    remote_type: 'on-site',
    url: 'https://example.com/careers/robotics-engineer-aerodynamics',
    source: 'Curated Benchmark',
    posted_at: '5 days ago',
    description: `Design, integrate, and test low-level embedded software and sensor control pipelines for automated aerospace testing platforms.
This role is based on-site in our advanced hardware lab in Cambridge.`,
    requirements: `• Bachelor's or Master's in Robotics, Computer Engineering, or Electrical Engineering.
• Strong C/C++ or Rust programming skills for embedded hardware and real-time operating systems.
• Practical hands-on experience interfacing with sensors, actuators, CAN bus, and SPI/I2C protocols.
• Experience debugging hardware in lab environments using oscilloscopes and logic analyzers.`,
    technologies: ['C++', 'Rust', 'Embedded Linux', 'RTOS', 'CAN bus', 'Robotics', 'Hardware Testing'],
  },
];
