from django.db import migrations, models


def seed_existing_venue_locations(apps, schema_editor):
    Venue = apps.get_model("events", "Venue")
    Venue.objects.filter(city="").update(city="Manila")
    Venue.objects.filter(name__iexact="Barangay Hall", address="").update(
        address="Barangay 663-A Covered Court"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0014_venue_event_venue_ref"),
    ]

    operations = [
        migrations.AddField(
            model_name="venue",
            name="city",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="venue",
            name="address",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.RunPython(seed_existing_venue_locations, migrations.RunPython.noop),
    ]
