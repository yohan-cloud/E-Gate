from django.db import migrations, models
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("residents", "0003_add_phone_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="residentprofile",
            name="is_verified",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="residentprofile",
            name="verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="VerificationRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("document", models.FileField(upload_to="verifications/")),
                ("note", models.TextField(blank=True)),
                ("admin_note", models.TextField(blank=True)),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "reviewed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.SET_NULL,
                        related_name="verification_reviews",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name="verification_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="verificationrequest",
            index=models.Index(fields=["status"], name="residents_v_status_d3cf3d_idx"),
        ),
        migrations.AddIndex(
            model_name="verificationrequest",
            index=models.Index(fields=["created_at"], name="residents_v_created_fa34d4_idx"),
        ),
    ]
