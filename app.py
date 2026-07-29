from datetime import datetime

from flask import Flask, render_template, request, Response, jsonify

app = Flask(__name__)


@app.route('/')
def home():
    return render_template('home.html')


@app.route('/create_rollout')
def create_rollout():
    return render_template('create.html')


@app.route('/export/pdf', methods=['POST'])
def export_pdf():
    """
    Renders a roll-out plan (and, if generated, a session plan) to PDF.

    This route deliberately does NOT re-run the business-day / holiday
    calculations — it trusts the already-computed numbers sent by the
    client (see static/js/rollout.js, which is the single source of
    truth for the scheduling logic) and just formats them into a
    printable document. That keeps the calculation logic in one place
    instead of duplicated across JS and Python.
    """
    try:
        from weasyprint import HTML
    except Exception as exc:  # pragma: no cover - environment issue, not a bug
        return jsonify({
            'error': 'PDF export is unavailable — WeasyPrint failed to import.',
            'detail': str(exc),
            'hint': (
                'WeasyPrint needs system libraries (pango, cairo, gdk-pixbuf) '
                'installed alongside the pip package — see README.md.'
            ),
        }), 500

    data = request.get_json(silent=True) or {}

    cohort_name = (data.get('cohortName') or 'Roll-out Plan').strip()
    induction_date = data.get('inductionDate')
    start_date = data.get('startDate')
    exam_date = data.get('examDate')
    modules = data.get('modules') or []
    summary = data.get('summary') or {}
    sessions = data.get('sessions') or []

    html_string = render_template(
        'pdf_report.html',
        cohort_name=cohort_name,
        induction_date=induction_date,
        start_date=start_date,
        exam_date=exam_date,
        modules=modules,
        summary=summary,
        sessions=sessions,
        generated_on=datetime.now().strftime('%d %b %Y, %H:%M'),
    )

    pdf_bytes = HTML(string=html_string, base_url=request.url_root).write_pdf()

    safe_name = ''.join(c if c.isalnum() else '-' for c in cohort_name.lower()).strip('-')
    safe_name = safe_name or 'rollout-plan'

    return Response(
        pdf_bytes,
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{safe_name}.pdf"'},
    )


if __name__ == '__main__':
    app.run(debug=True)
