// Skills taxonomy with aliases.
// The categorisation approach and keyword bucket system are informed by the
// MIT-licensed ResumeSkills project (https://github.com/Paramchoudhary/ResumeSkills).

export interface SkillDef {
  canonical: string;
  aliases: string[]; // matched case-insensitively on word boundaries
  category: SkillCategory;
}

export type SkillCategory =
  | 'language'
  | 'framework'
  | 'database'
  | 'cloud'
  | 'devops'
  | 'testing'
  | 'data'
  | 'mobile'
  | 'web'
  | 'tool'
  | 'concept'
  | 'business'
  | 'design';

const S = (canonical: string, category: SkillCategory, aliases: string[] = []): SkillDef => ({
  canonical,
  category,
  aliases,
});

export const SKILLS: SkillDef[] = [
  // Languages
  S('Java', 'language', ['java 8', 'java 11', 'java 17', 'core java', 'java8', 'java17']),
  S('Python', 'language', ['python3']),
  S('JavaScript', 'language', ['js', 'es6', 'ecmascript', 'vanilla javascript']),
  S('TypeScript', 'language', ['ts']),
  S('C#', 'language', ['c sharp', 'csharp', '.net c#']),
  S('C++', 'language', ['cpp', 'c plus plus']),
  S('C', 'language', []),
  S('Go', 'language', ['golang']),
  S('Rust', 'language', []),
  S('Ruby', 'language', []),
  S('PHP', 'language', []),
  S('Kotlin', 'language', []),
  S('Swift', 'language', []),
  S('Scala', 'language', []),
  S('R', 'language', []),
  S('SQL', 'language', ['ansi sql']),
  S('Bash', 'language', ['shell scripting', 'shell', 'bash scripting', 'unix shell']),
  S('PowerShell', 'language', []),
  S('HTML', 'web', ['html5']),
  S('CSS', 'web', ['css3']),
  S('SASS', 'web', ['scss']),
  S('GraphQL', 'web', ['apollo', 'graph ql']),
  S('MATLAB', 'language', []),
  S('VBA', 'language', []),
  S('Solidity', 'language', []),
  S('Dart', 'language', []),
  S('Objective-C', 'language', ['objc']),

  // Frameworks / backend
  S('Spring Boot', 'framework', ['springboot', 'spring-boot']),
  S('Spring', 'framework', ['spring framework', 'spring mvc', 'spring security', 'spring data']),
  S('Hibernate', 'framework', ['jpa', 'hibernate orm']),
  S('Node.js', 'framework', ['nodejs', 'node js', 'node']),
  S('Express', 'framework', ['express.js', 'expressjs']),
  S('NestJS', 'framework', ['nest.js', 'nest js']),
  S('Django', 'framework', []),
  S('Flask', 'framework', []),
  S('FastAPI', 'framework', ['fast api']),
  S('.NET', 'framework', ['dotnet', 'asp.net', 'asp.net core', '.net core', 'entity framework']),
  S('Laravel', 'framework', []),
  S('Rails', 'framework', ['ruby on rails', 'ror']),
  S('Micronaut', 'framework', []),
  S('Quarkus', 'framework', []),
  S('gRPC', 'framework', ['grpc']),
  S('Apache Kafka', 'devops', ['kafka', 'apache-kafka']),
  S('RabbitMQ', 'devops', ['rabbit mq', 'amqp']),
  S('Celery', 'framework', []),
  S('Struts', 'framework', []),
  S('JSF', 'framework', ['javaserver faces']),

  // Frontend
  S('React', 'framework', ['react.js', 'reactjs', 'react 18']),
  S('Next.js', 'framework', ['nextjs', 'next js']),
  S('Vue.js', 'framework', ['vue', 'vuejs']),
  S('Angular', 'framework', ['angularjs', 'angular 2+']),
  S('Svelte', 'framework', ['sveltekit']),
  S('Redux', 'framework', ['redux toolkit', 'react redux']),
  S('Tailwind CSS', 'web', ['tailwind', 'tailwindcss']),
  S('Bootstrap', 'web', []),
  S('jQuery', 'web', []),
  S('Webpack', 'web', []),
  S('Vite', 'web', []),
  S('Storybook', 'web', []),
  S('Three.js', 'web', ['threejs']),
  S('D3.js', 'data', ['d3']),
  S('WebSockets', 'web', ['websocket', 'socket.io', 'socketio']),
  S('REST APIs', 'concept', [
    'rest',
    'restful',
    'rest api',
    'restful api',
    'restful apis',
    'restful services',
    'restful web services',
  ]),
  S('Microservices', 'concept', ['micro services', 'micro-services', 'microservice architecture']),
  S('SOAP', 'concept', []),
  S('Responsive Design', 'web', ['mobile-first', 'mobile first']),
  S('Accessibility', 'web', ['a11y', 'wcag']),
  S('Server-Side Rendering', 'web', ['ssr', 'server side rendering']),
  S('State Management', 'web', ['state management']),

  // Databases
  S('PostgreSQL', 'database', ['postgres', 'psql']),
  S('MySQL', 'database', ['mariadb']),
  S('SQL Server', 'database', ['mssql', 'microsoft sql server', 'ms sql']),
  S('Oracle', 'database', ['oracle db', 'oracle database', 'pl/sql']),
  S('MongoDB', 'database', ['mongo', 'mongoose']),
  S('Redis', 'database', ['elasticache']),
  S('Elasticsearch', 'database', ['elastic search', 'opensearch']),
  S('DynamoDB', 'database', ['dynamo db']),
  S('Cassandra', 'database', ['apache cassandra']),
  S('SQLite', 'database', ['sqlite3']),
  S('Firebase', 'database', ['firestore']),
  S('Supabase', 'database', []),
  S('Couchbase', 'database', []),
  S('Neo4j', 'database', []),
  S('InfluxDB', 'database', []),
  S('Snowflake', 'data', []),
  S('BigQuery', 'data', ['google bigquery']),
  S('Database Design', 'database', ['data modelling', 'data modeling', 'schema design', 'database schema']),
  S('Query Optimization', 'database', ['query optimisation', 'sql tuning', 'query tuning', 'index optimization']),
  S('Data Warehousing', 'data', ['data warehouse', 'dw']),

  // Cloud
  S('AWS', 'cloud', [
    'amazon web services',
    'ec2',
    's3',
    'lambda',
    'cloudformation',
    'rds',
    'dynamodb aws',
    'amazon s3',
    'aws lambda',
  ]),
  S('Azure', 'cloud', ['microsoft azure', 'azure devops services']),
  S('GCP', 'cloud', ['google cloud', 'google cloud platform', 'app engine', 'cloud run']),
  S('Serverless', 'cloud', ['serverless architecture', 'faas']),
  S('Cloud Architecture', 'cloud', ['cloud computing', 'cloud native', 'cloud infrastructure']),
  S('Heroku', 'cloud', []),
  S('Vercel', 'cloud', []),
  S('Netlify', 'cloud', []),

  // DevOps
  S('Docker', 'devops', ['containerization', 'containerisation', 'docker compose', 'containers']),
  S('Kubernetes', 'devops', ['k8s', 'eks', 'aks', 'gke', 'helm']),
  S('Terraform', 'devops', ['infrastructure as code', 'iac', 'terragrunt']),
  S('Ansible', 'devops', []),
  S('Jenkins', 'devops', []),
  S('CI/CD', 'devops', [
    'ci cd',
    'cicd',
    'continuous integration',
    'continuous delivery',
    'continuous deployment',
    'github actions',
    'gitlab ci',
    'circleci',
    'circle ci',
    'azure pipelines',
    'bitbucket pipelines',
  ]),
  S('Git', 'tool', ['github', 'gitlab', 'bitbucket', 'version control']),
  S('Linux', 'devops', ['unix', 'ubuntu', 'centos', 'debian', 'rhel']),
  S('Nginx', 'devops', ['nginx']),
  S('Apache HTTP Server', 'devops', ['apache httpd', 'httpd', 'apache tomcat', 'tomcat']),
  S('Prometheus', 'devops', []),
  S('Grafana', 'devops', []),
  S('Datadog', 'devops', []),
  S('Splunk', 'devops', []),
  S('ELK Stack', 'devops', ['elk', 'logstash', 'kibana']),
  S('Observability', 'devops', ['monitoring', 'apm', 'opentelemetry', 'otel']),
  S('SRE', 'devops', ['site reliability', 'site reliability engineering', 'slo', 'sla']),
  S('ArgoCD', 'devops', ['argo cd', 'gitops']),
  S('Puppet', 'devops', []),
  S('Chef', 'devops', []),
  S('Vault', 'devops', ['hashicorp vault']),

  // Testing
  S('Unit Testing', 'testing', ['unit tests', 'unit test', 'unit-testing']),
  S('JUnit', 'testing', ['junit 5', 'junit4']),
  S('Mockito', 'testing', []),
  S('Pytest', 'testing', ['pytest']),
  S('Jest', 'testing', ['vitest']),
  S('Cypress', 'testing', []),
  S('Playwright', 'testing', []),
  S('Selenium', 'testing', ['selenium webdriver']),
  S('TestNG', 'testing', []),
  S('TDD', 'testing', ['test driven development', 'test-driven development']),
  S('BDD', 'testing', ['behavior driven development', 'behaviour driven development', 'cucumber']),
  S('Integration Testing', 'testing', ['integration tests', 'integration test']),
  S('Load Testing', 'testing', ['jmeter', 'performance testing', 'load tests', 'gatling', 'k6']),

  // Data / AI
  S('Machine Learning', 'data', ['ml', 'machine-learning']),
  S('Deep Learning', 'data', ['neural networks', 'tensorflow', 'pytorch', 'keras']),
  S('NLP', 'data', ['natural language processing', 'spacy', 'nltk']),
  S('Computer Vision', 'data', ['opencv', 'image processing']),
  S('Pandas', 'data', []),
  S('NumPy', 'data', ['numpy']),
  S('scikit-learn', 'data', ['sklearn', 'scikit learn']),
  S('Spark', 'data', ['apache spark', 'pyspark', 'spark sql']),
  S('Hadoop', 'data', ['hdfs', 'hive', 'mapreduce']),
  S('Airflow', 'data', ['apache airflow']),
  S('dbt', 'data', ['data build tool']),
  S('ETL', 'data', ['etl pipelines', 'elt', 'data pipelines', 'data pipeline']),
  S('Data Analysis', 'data', ['data analytics', 'data visualisation', 'data visualization', 'tableau', 'power bi', 'powerbi']),
  S('Statistics', 'data', ['statistical analysis', 'a/b testing', 'ab testing', 'hypothesis testing']),
  S('LLMs', 'data', ['large language models', 'llm', 'openai api', 'generative ai', 'gen ai', 'prompt engineering']),
  S('LangChain', 'data', ['lang chain']),
  S('Computer Graphics', 'data', ['webgl', 'opengl']),

  // Mobile
  S('Android', 'mobile', ['android development', 'android sdk', 'jetpack compose']),
  S('iOS', 'mobile', ['ios development', 'swiftui', 'uikit']),
  S('React Native', 'mobile', ['react-native']),
  S('Flutter', 'mobile', []),

  // Tools / Business
  S('Agile', 'business', ['scrum', 'kanban', 'agile methodologies', 'agile development', 'sprint planning']),
  S('JIRA', 'tool', ['atlassian', 'confluence']),
  S('Postman', 'tool', ['insomnia']),
  S('Swagger', 'tool', ['openapi', 'open api']),
  S('Figma', 'design', []),
  S('Adobe XD', 'design', []),
  S('Sketch', 'design', []),
  S('UI/UX', 'design', ['ux', 'ui design', 'user experience', 'user interface', 'usability']),
  S('Design Systems', 'design', ['component library']),
  S('Salesforce', 'business', ['crm']),
  S('SAP', 'business', []),
  S('Excel', 'business', ['microsoft excel', 'advanced excel', 'pivot tables', 'vlookup']),
  S('Word', 'business', ['microsoft word']),
  S('PowerPoint', 'business', ['microsoft powerpoint', 'powerpoint']),
  S('SharePoint', 'business', []),
  S('Microsoft Office', 'business', ['ms office', 'office 365', 'ms excel', 'microsoft office suite']),
  S('SEO', 'business', ['search engine optimization', 'search engine optimisation']),
  S('Google Analytics', 'business', ['ga4']),
  S('Marketing', 'business', ['digital marketing', 'content marketing', 'email marketing']),
  S('Product Management', 'business', ['product owner', 'product roadmap', 'backlog management']),
  S('Stakeholder Management', 'business', ['stakeholder engagement', 'cross-functional collaboration', 'cross functional']),
  S('Requirements Gathering', 'business', ['business analysis', 'requirements analysis', 'brd']),
  S('Project Management', 'business', ['pmp', 'prince2', 'project planning']),
  S('Accounting', 'business', ['financial reporting', 'bookkeeping', 'gaap', 'ifrs']),
  S('Technical Documentation', 'tool', ['documentation', 'technical writing', 'api documentation']),

  // Concepts
  S('OOP', 'concept', ['object oriented programming', 'object-oriented programming', 'object oriented design', 'solid principles']),
  S('Data Structures', 'concept', ['dsa', 'data structures and algorithms', 'algorithms', 'algorithm design']),
  S('Design Patterns', 'concept', ['mvc', 'singleton', 'factory pattern', 'observer pattern']),
  S('System Design', 'concept', ['distributed systems', 'scalability', 'high availability', 'fault tolerance', 'load balancing', 'caching']),
  S('Multithreading', 'concept', ['concurrency', 'multi-threading', 'parallel processing', 'async programming']),
  S('Security', 'concept', [
    'application security',
    'oauth',
    'oauth2',
    'jwt',
    'authentication',
    'authorization',
    'owasp',
    'penetration testing',
    'encryption',
    'cybersecurity',
  ]),
  S('Networking', 'concept', ['tcp/ip', 'http/https', 'dns', 'load balancers', 'vpc']),
  S('Message Queues', 'concept', ['message queue', 'event-driven', 'event driven architecture', 'pub/sub', 'pubsub']),
  S('API Design', 'concept', ['api development', 'api gateway', 'api integration', 'api development']),
  S('Code Review', 'concept', ['peer review', 'pull requests', 'code reviews']),
  S('Refactoring', 'concept', ['clean code', 'technical debt']),
  S('Performance Optimization', 'concept', [
    'performance tuning',
    'performance optimisation',
    'application performance',
    'latency optimization',
  ]),
  S('DevOps Culture', 'concept', ['devops practices']),
  S('Blockchain', 'concept', ['smart contracts', 'web3', 'ethereum']),
  S('IoT', 'concept', ['internet of things', 'mqtt', 'embedded systems', 'embedded c']),
  S('Game Development', 'concept', ['unity', 'unreal engine']),

  // Certifications (also matched as skills for matching purposes)
  S('AWS Certified', 'concept', [
    'aws certified solutions architect',
    'aws certified developer',
    'aws certified cloud practitioner',
    'aws solutions architect',
  ]),
  S('Azure Certified', 'concept', ['az-104', 'az-900', 'azure administrator', 'azure fundamentals']),
  S('GCP Certified', 'concept', ['professional cloud architect', 'associate cloud engineer']),
  S('CKA', 'concept', ['certified kubernetes administrator']),
  S('PMP Certified', 'concept', ['project management professional']),
  S('Scrum Master Certified', 'concept', ['csm', 'psm', 'certified scrum master', 'professional scrum master']),
  S('Oracle Certified', 'concept', ['ocjp', 'ocp', 'oracle certified professional', 'oracle certified java programmer']),
];

// Soft skills dictionary (ResumeSkills-informed)
export const SOFT_SKILLS: string[] = [
  'communication',
  'leadership',
  'teamwork',
  'collaboration',
  'problem solving',
  'problem-solving',
  'critical thinking',
  'adaptability',
  'time management',
  'mentoring',
  'presentation skills',
  'negotiation',
  'attention to detail',
  'creativity',
  'work ethic',
  'ownership',
  'initiative',
  'conflict resolution',
  'decision making',
  'empathy',
  'coaching',
  'analytical thinking',
  'organisational skills',
  'organizational skills',
  'interpersonal skills',
  'self-motivated',
  'self motivated',
  'team player',
  'fast learner',
  'quick learner',
  'detail oriented',
  'detail-oriented',
  'written communication',
  'verbal communication',
  'stakeholder communication',
  'cross-team collaboration',
];

/**
 * Concept-level skills that are evidenced by concrete tools. If a JD asks for
 * the concept and the CV lists a concrete tool from this family, the concept
 * is considered matched (with attribution to the tool) — e.g. "State
 * Management" is evidenced by Redux; "Design Systems" by Storybook.
 */
export const RELATED_SKILLS: Record<string, string[]> = {
  'State Management': ['Redux', 'Vuex', 'MobX', 'Zustand', 'Pinia', 'React'],
  'Design Systems': ['Storybook', 'Figma', 'Bootstrap', 'Tailwind CSS'],
  'Responsive Design': ['Tailwind CSS', 'Bootstrap', 'CSS', 'HTML'],
  'Integration Testing': ['Jest', 'JUnit', 'Mockito', 'Pytest', 'Cypress', 'Selenium', 'Playwright', 'TestNG', 'Vitest'],
  'Unit Testing': ['Jest', 'JUnit', 'Mockito', 'Pytest', 'Cypress', 'TestNG', 'Vitest'],
  'TDD': ['Jest', 'JUnit', 'Mockito', 'Pytest', 'Cypress', 'Vitest'],
  'CI/CD': ['Jenkins', 'GitHub Actions', 'GitLab', 'CircleCI', 'Azure', 'Bitbucket'],
  'Cloud Architecture': ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes'],
  Observability: ['Prometheus', 'Grafana', 'Datadog', 'Splunk', 'ELK Stack'],
  'Message Queues': ['Kafka', 'RabbitMQ'],
  'Data Analysis': ['Tableau', 'Pandas', 'Excel', 'Statistics'],
  'Database Design': ['PostgreSQL', 'MySQL', 'SQL Server', 'MongoDB', 'Oracle'],
  'Query Optimization': ['PostgreSQL', 'MySQL', 'SQL Server', 'Oracle'],
  Security: ['OAuth', 'JWT', 'OWASP', 'AWS'],
  'API Design': ['REST APIs', 'GraphQL', 'gRPC', 'Swagger'],
  'Server-Side Rendering': ['Next.js', 'Nuxt', 'Angular'],
  'Machine Learning': ['TensorFlow', 'PyTorch', 'scikit-learn', 'Pandas'],
  'Deep Learning': ['TensorFlow', 'PyTorch', 'Keras'],
  'Accessibility': ['WCAG'],
  'Microservices': ['Docker', 'Kubernetes', 'Spring Boot', 'Kafka'],
  'System Design': ['Docker', 'Kubernetes', 'Redis', 'Microservices', 'AWS'],
  'Performance Optimization': ['Redis', 'React', 'Caching'],
  OOP: ['Java', 'C#', 'C++', 'Python', 'TypeScript'],
  'Data Structures': ['Java', 'C++', 'Python'],
  'Technical Documentation': ['Swagger', 'Confluence'],
};

const canonicalByLower = new Map<string, SkillDef>();
for (const s of SKILLS) {
  canonicalByLower.set(s.canonical.toLowerCase(), s);
}

const allTerms: { term: string; def: SkillDef }[] = [];
for (const def of SKILLS) {
  allTerms.push({ term: def.canonical.toLowerCase(), def });
  for (const a of def.aliases) allTerms.push({ term: a.toLowerCase(), def });
}
// Longest-first so "spring boot" wins over "spring", "aws lambda" over "lambda".
allTerms.sort((a, b) => b.term.length - a.term.length);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const termPatternCache = new Map<string, RegExp>();

export function skillTermRegex(term: string): RegExp {
  let re = termPatternCache.get(term);
  if (!re) {
    const escaped = escapeRegExp(term);
    // word-boundary-ish match; handles leading/trailing symbols like c#, .net, c++
    const pattern = `(?<![a-z0-9+#.])${escaped}(?![a-z0-9+#])`;
    re = new RegExp(pattern, 'gi');
    termPatternCache.set(term, re);
  }
  return re;
}

export interface SkillMention {
  canonical: string;
  category: SkillCategory;
  matchIndex: number;
}

/** Find all canonical skills mentioned in a text. */
export function findSkillsInText(text: string): SkillMention[] {
  const lower = text.toLowerCase();
  const found = new Map<string, SkillMention>();
  const consumed: [number, number][] = [];
  for (const { term, def } of allTerms) {
    if (term.length < 2) continue; // skip single letters like "R", "C"
    const re = skillTermRegex(term);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Skip if fully inside an already-matched longer skill span (e.g. "spring" in "spring boot")
      const inside = consumed.some(([s, e]) => start >= s && end <= e);
      if (!inside) {
        consumed.push([start, end]);
        if (!found.has(def.canonical)) {
          found.set(def.canonical, {
            canonical: def.canonical,
            category: def.category,
            matchIndex: start,
          });
        }
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return [...found.values()].sort((a, b) => a.matchIndex - b.matchIndex);
}

/** Count occurrences of a canonical skill in text (all aliases). */
export function countSkillOccurrences(text: string, canonical: string): number {
  const def = SKILLS.find((s) => s.canonical === canonical);
  if (!def) return 0;
  const lower = text.toLowerCase();
  let count = 0;
  for (const term of [def.canonical.toLowerCase(), ...def.aliases.map((a) => a.toLowerCase())]) {
    if (term.length < 2) continue;
    const re = skillTermRegex(term);
    count += (lower.match(re) || []).length;
  }
  return count;
}

export function getSkillDef(canonical: string): SkillDef | undefined {
  return canonicalByLower.get(canonical.toLowerCase());
}

/** Split a skills string like "Java, Spring Boot / REST APIs" into individual skill names. */
export function splitSkillList(raw: string): string[] {
  return raw
    .split(/[,;/|•\u2022]|\u00b7|\band\b/gi)
    .map((s) => s.trim().replace(/^[-*\u2022\-\u25aa\d.)\s]+/, '').trim())
    .filter((s) => s.length > 1 && s.length < 60);
}
