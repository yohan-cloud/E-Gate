from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0011_alter_event_event_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="event",
            name="audience_type",
            field=models.CharField(default="all", max_length=64),
        ),
    ]
