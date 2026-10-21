#!/usr/bin/env python3
"""Create clearly marked, one-page PDF assets for the client staging prototype."""

import json
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]


def frontmatter(path):
    raw = path.read_text(encoding="utf-8")
    match = re.match(r"^---\r?\n([\s\S]*?)\r?\n---", raw)
    if not match:
        raise ValueError(f"Missing frontmatter: {path}")
    return match.group(1)


def scalar(source, key):
    match = re.search(rf"^{re.escape(key)}:\s*(.*)$", source, re.MULTILINE)
    if not match:
        return ""
    value = match.group(1).strip()
    if value.startswith('"'):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value.strip('"')
    return value


def footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d8b257"))
    canvas.line(22 * mm, 17 * mm, A4[0] - 22 * mm, 17 * mm)
    canvas.setFillColor(colors.HexColor("#705a25"))
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawCentredString(A4[0] / 2, 11 * mm, "PROTOTYPE - DUMMY DATA - STAGING PREVIEW")
    canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="DocTitle", parent=styles["Title"], fontName="Times-Bold", fontSize=21, leading=26, textColor=colors.HexColor("#18233a"), alignment=TA_CENTER, spaceAfter=7 * mm))
styles.add(ParagraphStyle(name="DocMeta", parent=styles["Normal"], fontName="Helvetica", fontSize=9, leading=13, textColor=colors.HexColor("#536078"), alignment=TA_CENTER, spaceAfter=3 * mm))
styles.add(ParagraphStyle(name="SectionHead", parent=styles["Heading2"], fontName="Times-Bold", fontSize=13, leading=17, textColor=colors.HexColor("#273c5a"), spaceBefore=4 * mm, spaceAfter=2 * mm))
styles.add(ParagraphStyle(name="DocBody", parent=styles["BodyText"], fontName="Times-Roman", fontSize=10, leading=15, textColor=colors.HexColor("#293346"), spaceAfter=3 * mm))
styles.add(ParagraphStyle(name="WeekHead", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.HexColor("#18233a"), spaceBefore=2 * mm, spaceAfter=1 * mm))
styles.add(ParagraphStyle(name="Reading", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, leading=12, leftIndent=4 * mm, textColor=colors.HexColor("#536078"), spaceAfter=1 * mm))


def create_pdf(path, flowables):
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(path), pagesize=A4, rightMargin=22 * mm, leftMargin=22 * mm, topMargin=20 * mm, bottomMargin=23 * mm, title=path.stem.replace("-", " ").title(), author="DRC Observatory prototype")
    doc.build(flowables, onFirstPage=footer, onLaterPages=footer)


def create_paper_pdfs():
    filenames = {
        "cordry-2021-philosophy-of-struggle-harris": "drc-2021-philosophy-of-struggle-prototype.pdf",
        "cordry-2022-insurrectionist-ethics": "drc-2022-insurrectionist-ethics-prototype.pdf",
        "cordry-2022-wynter-stiegler-myth-memory": "drc-2022-wynter-stiegler-prototype.pdf",
        "cordry-2023-spirituality-end-of-world": "drc-2023-spirituality-prototype.pdf",
    }
    for source in sorted((ROOT / "src/data/publications").glob("*.md")):
        data = frontmatter(source)
        title = scalar(data, "title")
        venue = scalar(data, "venue")
        year = scalar(data, "year")
        abstract = scalar(data, "abstract")
        output = ROOT / "public/papers" / filenames[source.stem]
        flowables = [
            Paragraph("Duncan R. Cordry", styles["DocMeta"]),
            Paragraph(title, styles["DocTitle"]),
            Paragraph(f"{venue} | {year}", styles["DocMeta"]),
            Spacer(1, 7 * mm),
            Paragraph("Abstract", styles["SectionHead"]),
            Paragraph(abstract, styles["DocBody"]),
            Spacer(1, 4 * mm),
            Paragraph("Prototype reference copy", styles["SectionHead"]),
            Paragraph("This sample PDF is included to make the staging preview links functional. Replace it with the approved publication file before launch.", styles["DocBody"]),
        ]
        create_pdf(output, flowables)


def create_syllabus_pdfs():
    for source in sorted((ROOT / "src/data/classes").glob("*.md")):
        data = frontmatter(source)
        title = scalar(data, "title")
        course_code = scalar(data, "courseCode")
        year = scalar(data, "academicYear")
        term = scalar(data, "term")
        level = scalar(data, "level")
        summary = scalar(data, "summary")
        flowables = [
            Paragraph(f"{course_code} | Course Syllabus", styles["DocMeta"]),
            Paragraph(title, styles["DocTitle"]),
            Paragraph(f"{term} {year} | {level} | Ashoka University", styles["DocMeta"]),
            Spacer(1, 4 * mm),
            Paragraph("Course description", styles["SectionHead"]),
            Paragraph(summary, styles["DocBody"]),
            Paragraph("Seminar schedule", styles["SectionHead"]),
        ]
        week_pattern = re.compile(r'  - weekNumber: "([^"]+)"\s+    topic: "([^"]+)"\s+    readings:\s+((?:      - "[^"]+"\s*)+)', re.MULTILINE)
        for week, topic, readings_block in week_pattern.findall(data):
            flowables.append(Paragraph(f"{week} - {topic}", styles["WeekHead"]))
            for reading in re.findall(r'      - "([^"]+)"', readings_block):
                flowables.append(Paragraph(f"- {reading}", styles["Reading"]))
        create_pdf(ROOT / "public/syllabi" / f"{course_code.lower().replace(' ', '-')}-prototype.pdf", flowables)


if __name__ == "__main__":
    create_paper_pdfs()
    create_syllabus_pdfs()
    print("Generated 4 prototype paper PDFs and 4 prototype syllabus PDFs.")
