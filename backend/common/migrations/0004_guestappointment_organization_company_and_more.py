from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0003_guestappointment_qr_and_scanlog"),
    ]

    operations = [
        migrations.AddField(
            model_name="guestappointment",
            name="no_of_participants",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="guestappointment",
            name="organization_company",
            field=models.CharField(blank=True, max_length=160),
        ),
    ]
