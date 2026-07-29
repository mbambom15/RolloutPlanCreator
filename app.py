from datetime import datetime
from io import BytesIO

from flask import Flask, render_template, request, Response, jsonify
from xhtml2pdf import pisa

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("home.html")


@app.route("/create_rollout")
def create_rollout():
    return render_template("create.html")


def generate_pdf(html_content):
    """
    Converts HTML into a PDF using xhtml2pdf.
    Returns the PDF as bytes, or None if generation fails.
    """
    pdf_buffer = BytesIO()

    result = pisa.CreatePDF(
        src=html_content,
        dest=pdf_buffer,
        encoding="UTF-8"
    )

    if result.err:
        return None

    pdf_buffer.seek(0)
    return pdf_buffer.read()


@app.route("/export/pdf", methods=["POST"])
def export_pdf():
    """
    Exports the rollout plan and optional session plan as a PDF.

    Scheduling calculations are NOT performed here.
    The frontend sends the completed schedule, and this route
    simply renders it into a printable PDF.
    """

    try:
        data = request.get_json(silent=True) or {}

        cohort_name = (
            data.get("cohortName") or "Roll-out Plan"
        ).strip()

        induction_date = data.get("inductionDate")
        start_date = data.get("startDate")
        exam_date = data.get("examDate")

        modules = data.get("modules") or []
        summary = data.get("summary") or {}
        sessions = data.get("sessions") or []

        html_string = render_template(
            "pdf_report.html",
            cohort_name=cohort_name,
            induction_date=induction_date,
            start_date=start_date,
            exam_date=exam_date,
            modules=modules,
            summary=summary,
            sessions=sessions,
            generated_on=datetime.now().strftime("%d %b %Y, %H:%M"),
        )

        pdf_bytes = generate_pdf(html_string)

        if pdf_bytes is None:
            return jsonify({
                "error": "Failed to generate PDF."
            }), 500

        safe_name = "".join(
            c if c.isalnum() else "-"
            for c in cohort_name.lower()
        ).strip("-")

        if not safe_name:
            safe_name = "rollout-plan"

        return Response(
            pdf_bytes,
            mimetype="application/pdf",
            headers={
                "Content-Disposition":
                    f'attachment; filename="{safe_name}.pdf"'
            }
        )

    except Exception as exc:
        return jsonify({
            "error": "An unexpected error occurred while generating the PDF.",
            "detail": str(exc)
        }), 500


if __name__ == "__main__":
    app.run(debug=True)