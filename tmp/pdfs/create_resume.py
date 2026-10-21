from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether

OUT = r"C:\\Users\\basri\\Documents\\Codex\\2026-10-09\\google-drive-plugin-google-drive-openai-2\\output\\pdf\\Zaid_Basri_Resume_Updated.pdf"

# Matches the proportions of the supplied one-page resume.
PAGE = (648, 806.4)
MARGIN_X = 34
MARGIN_TOP = 25
MARGIN_BOTTOM = 23
INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#374151")
ACCENT = colors.HexColor("#0f3f72")
RULE = colors.HexColor("#9ca3af")

styles = getSampleStyleSheet()
name = ParagraphStyle("Name", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=17, leading=18, textColor=INK, alignment=TA_CENTER, spaceAfter=3)
contact = ParagraphStyle("Contact", parent=styles["Normal"], fontName="Helvetica", fontSize=8.6, leading=10.5, textColor=MUTED, alignment=TA_CENTER, spaceAfter=8)
section = ParagraphStyle("Section", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9.8, leading=12, textColor=ACCENT, spaceBefore=5, spaceAfter=2)
role = ParagraphStyle("Role", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8.9, leading=10.7, textColor=INK)
meta = ParagraphStyle("Meta", parent=styles["Normal"], fontName="Helvetica", fontSize=8.45, leading=10.3, textColor=MUTED)
bullet = ParagraphStyle("Bullet", parent=styles["Normal"], fontName="Helvetica", fontSize=8.05, leading=9.95, textColor=INK, leftIndent=10, firstLineIndent=-7, spaceAfter=1.25)
skills = ParagraphStyle("Skills", parent=styles["Normal"], fontName="Helvetica", fontSize=7.95, leading=9.75, textColor=INK, spaceAfter=1.25)
pub = ParagraphStyle("Pub", parent=styles["Normal"], fontName="Helvetica", fontSize=8.05, leading=9.8, textColor=INK)

def p(text, style):
    return Paragraph(text, style)

def heading(title):
    return [p(title, section), p('<font color="#9ca3af">' + '_' * 154 + '</font>', ParagraphStyle("Rule", parent=styles["Normal"], fontSize=2.2, leading=2.5, spaceAfter=2))]

def position(company, dates, title, location, bullets):
    rows = [p(f'<b>{company}</b> <font color="#6b7280">{dates}</font>', role), p(f'<i>{title}</i> <font color="#4b5563">{location}</font>', meta)]
    rows.extend(p('&bull; ' + item, bullet) for item in bullets)
    return KeepTogether(rows + [Spacer(1, 2)])

story = []
story += [p('ZAID BASRI', name), p('(385) 215-0538 &nbsp;&nbsp;|&nbsp;&nbsp; basrizaid3108@gmail.com &nbsp;&nbsp;|&nbsp;&nbsp; LinkedIn &nbsp;&nbsp;|&nbsp;&nbsp; GitHub', contact)]

story += heading('EDUCATION')
story += [
    p('<b>University of Utah</b> <font color="#6b7280">Aug 2024 - May 2026</font>', role),
    p('M.S. Computer Science, GPA: 3.71/4.0 <font color="#4b5563">Salt Lake City, UT</font>', meta),
    p('<b>University of Mumbai</b> <font color="#6b7280">Sep 2018 - Aug 2022</font>', role),
    p('B.E. Computer Engineering, CGPA: 8.46/10 <font color="#4b5563">Mumbai, India</font>', meta),
]

story += heading('EXPERIENCE')
story.append(position('Reliance - Jio Platforms Limited', 'July 2022 - July 2024', 'Software Engineer', ' | RCP, India', [
    'Built a reusable, customizable <b>Angular</b> component library following SOLID principles, improving team development efficiency by <b>30%</b>.',
    'Engineered <b>Java Spring Boot</b> REST APIs and integrated Oracle SQL services, improving critical user-facing query performance.',
    'Implemented Angular Router navigation, dynamic REST data flows, state management, and RxJS-based asynchronous workflows to improve UI responsiveness by <b>25%</b>.',
    'Configured <b>Keycloak</b> OAuth2/OIDC authentication and role-based access control for enterprise portals.',
    'Improved advanced search through query optimization, reducing search time by <b>50%</b>, while delivering all milestones on schedule with design and backend teams.',
]))
story.append(position('Chartwells - Compass Group', 'September 2025 - Present', 'Tech Associate | IT & Automation', ' | Salt Lake City, UT', [
    'Built a Python cash-sheet automation workflow across <b>52 dining locations</b>, reducing processing time from 3-4 hours to under one hour and eliminating manual processing errors.',
    'Managed Infor, Tavlo, and Grubhub OneView data workflows across 52 locations, validating inventory, pricing, menus, availability, and user access for <b>4,000+ SKUs</b>.',
    'Coordinated with Grubhub engineering on campus-wide POS deployment; configured infrastructure and resolved device, network, and static-IP issues.',
    'Built a full-stack <b>Daily Audit</b> platform using React, Node.js/Express, and PostgreSQL to replace manual location-audit workflows with structured digital submissions and reviewable history.',
    'Implemented role-based auditor and God Admin workflows for location ownership, cross-auditor visibility, audit transfer requests, coverage scheduling, and auditor management.',
    'Designed multi-status checklist evidence, mandatory exception comments, not-applicable handling, overall audit notes, and repeatable weekly records.',
    'Deployed the staging platform on <b>AWS</b> with Docker, Amazon ECR, ECS Fargate, Application Load Balancing, RDS PostgreSQL, and versioned database migrations.',
]))

story += heading('TECHNICAL SKILLS')
story += [
    p('<b>Languages:</b> Python, JavaScript, Java, C++, SQL, TypeScript, HTML, CSS', skills),
    p('<b>Backend & Frameworks:</b> Spring Boot, REST APIs, Node.js, Angular, React, Microservices, Event-Driven Architecture', skills),
    p('<b>Databases:</b> PostgreSQL, Oracle SQL, MySQL, DynamoDB; query optimization, indexing, data modeling, DBMS', skills),
    p('<b>Data & AI:</b> PySpark, Pandas, NumPy, Matplotlib, Scikit-learn, TensorFlow, XGBoost, CatBoost, LightGBM, OpenCV', skills),
    p('<b>Cloud & DevOps:</b> AWS (EC2, S3, Lambda, DynamoDB, CloudWatch, ECS, ECR, RDS), Docker, Kubernetes, Git, CI/CD, GitHub Actions', skills),
]

story += heading('PROJECTS')
story += [
    p('<b>Chartwells AI Concierge</b> <font color="#4b5563">| LLM Agents, MCP, RAG, FastAPI, PostgreSQL, Qdrant, Angular</font>', role),
    p('&bull; Built a multi-agent LLM support system with hierarchical intent routing and Qdrant-backed RAG; developed asynchronous FastAPI services with PostgreSQL session state and role-based MCP tools.', bullet),
    p('<b>Income Level Prediction for Mortgage</b> <font color="#4b5563">| Python, CatBoost, XGBoost, LightGBM, Random Forest</font>', role),
    p('&bull; Designed an ensemble ML pipeline with feature engineering and hyperparameter tuning, achieving <b>92.89% validation accuracy</b>.', bullet),
    p('<b>H-1B Visa Approval Prediction</b> <font color="#4b5563">| Python, PySpark, Scikit-learn, PostgreSQL, XGBoost, SMOTE</font>', role),
    p('&bull; Built a scalable end-to-end ML pipeline on 2024 H-1B data, achieving <b>94.3% test accuracy</b> with XGBoost and SMOTE.', bullet),
]

story += heading('PUBLICATION')
story += [p('<b>Sports Analytics - Soccer Player Market Value Analysis and Potential Prediction</b> <font color="#4b5563">published at IJREAM</font>', pub)]

doc = SimpleDocTemplate(OUT, pagesize=PAGE, leftMargin=MARGIN_X, rightMargin=MARGIN_X, topMargin=MARGIN_TOP, bottomMargin=MARGIN_BOTTOM)
doc.build(story)
print(OUT)
