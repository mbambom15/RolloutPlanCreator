import os
from datetime import datetime
from io import BytesIO

from dotenv import load_dotenv
from flask import Flask, render_template, request, Response, jsonify
from xhtml2pdf import pisa
import resend

load_dotenv()  # reads .env locally; in production, set real env vars instead

app = Flask(__name__)

# Feedback always goes TO the admin inbox — the FROM address comes from
# RESEND_FROM_EMAIL in .env so it can be changed without a code edit.
FEEDBACK_TO = "admin@nkanyezionline.co.za"
FEEDBACK_FROM_DEFAULT = "Nkanyezi LMS <no-reply@nkanyezionline.co.za>"


@app.route("/")
def home():
    return render_template("home.html")


@app.route("/create_rollout")
def create_rollout():
    return render_template("create.html")


@app.route("/feedback", methods=["POST"])
def submit_feedback():
    """
    Sends the home-page feedback form to admin@nkanyezionline.co.za via
    Resend, using the already-verified nkanyezionline.co.za sending
    domain. Requires RESEND_API_KEY (and optionally RESEND_FROM_EMAIL)
    in the environment — see .env.
    """
    try:
        api_key = os.environ.get("RESEND_API_KEY")
        if not api_key:
            return jsonify({
                "error": "Feedback email is not configured on the server (missing RESEND_API_KEY)."
            }), 500

        from_email = os.environ.get("RESEND_FROM_EMAIL", FEEDBACK_FROM_DEFAULT)

        data = request.get_json(silent=True) or {}

        recommend = (data.get("recommend") or "").strip()
        suggestions = (data.get("suggestions") or "").strip()
        rating = (data.get("rating") or "").strip()
        first_name = (data.get("firstName") or "").strip()
        last_name = (data.get("lastName") or "").strip()
        email = (data.get("email") or "").strip()
        full_name = f"{first_name} {last_name}".strip() or "Anonymous"

        html_body = render_template(
            "feedback_email.html",
            recommend=recommend,
            rating=rating,
            suggestions=suggestions,
            full_name=full_name,
            email=email,
        )

        resend.api_key = api_key

        params = {
            "from": from_email,
            "to": [FEEDBACK_TO],
            "subject": f"New feedback from {full_name}",
            "html": html_body,
        }
        if email:
            params["reply_to"] = email

        resend.Emails.send(params)

        return jsonify({"ok": True})

    except Exception as exc:
        return jsonify({
            "error": "Could not send feedback email.",
            "detail": str(exc)
        }), 500


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
    app.run()