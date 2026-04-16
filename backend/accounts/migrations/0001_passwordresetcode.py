from django.db import migrations, models
import django.conf
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    # Ensure the custom user model (residents.User) exists before creating FK
    dependencies = [
        ("residents", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name='PasswordResetCode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                # Store hashed OTP (sha256 hex -> 64 chars; allow headroom)
                ('code', models.CharField(max_length=128)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('used', models.BooleanField(default=False)),
                ('user', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='reset_codes', to=django.conf.settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [
                    models.Index(fields=['user', 'code'], name='accounts_pa_user_id_c6cbd5_idx'),
                    models.Index(fields=['expires_at'], name='accounts_pa_expires_0e0fbf_idx'),
                    models.Index(fields=['used'], name='accounts_pa_used_01f660_idx'),
                ],
            },
        ),
    ]
