from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0010_event_audience_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="event",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("mandatory_governance_meetings", "Mandatory Governance Meetings"),
                    ("health_and_social_services", "Health and Social Services"),
                    ("community_events", "Community Events"),
                    ("operations_and_compliance", "Operations and Compliance"),
                ],
                max_length=40,
            ),
        ),
    ]
