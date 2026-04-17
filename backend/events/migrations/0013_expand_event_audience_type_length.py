from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0012_expand_event_audience_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="event",
            name="audience_type",
            field=models.CharField(default="all", max_length=128),
        ),
    ]
