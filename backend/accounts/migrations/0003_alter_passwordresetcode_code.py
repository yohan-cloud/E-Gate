from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_rename_accounts_pa_user_id_c6cbd5_idx_accounts_pa_user_id_193f58_idx_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="passwordresetcode",
            name="code",
            field=models.CharField(max_length=128),
        ),
    ]
