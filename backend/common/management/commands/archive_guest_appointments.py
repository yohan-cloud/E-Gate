from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from common.archive import archive_guest_appointment
from common.models import GuestAppointment


class Command(BaseCommand):
    help = "Archive completed guest appointments locally or to S3."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days-old",
            type=int,
            default=1,
            help="Archive completed appointments whose ETA is this many days old or older.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Maximum number of guest appointments to archive in one run.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List the appointments that would be archived without changing data.",
        )
        parser.add_argument(
            "--guest-id",
            type=int,
            help="Archive one specific guest appointment by ID.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options["dry_run"])
        limit = max(1, int(options["limit"]))
        guest_id = options.get("guest_id")
        days_old = int(options["days_old"])
        if days_old < 0:
            raise CommandError("--days-old must be zero or greater.")

        qs = GuestAppointment.objects.select_related(
            "created_by",
            "updated_by",
            "checked_in_by",
            "checked_out_by",
            "archived_by",
        ).prefetch_related("scan_logs")

        if guest_id:
            qs = qs.filter(pk=guest_id)
        else:
            cutoff_date = timezone.localdate() - timedelta(days=days_old)
            cutoff_dt = timezone.make_aware(datetime.combine(cutoff_date, time.max))
            qs = qs.filter(
                archived_at__isnull=True,
                status=GuestAppointment.Status.COMPLETED,
                eta__lte=cutoff_dt,
            )

        guests = list(qs.order_by("eta", "id")[:limit])
        if not guests:
            self.stdout.write(self.style.WARNING("No guest appointments matched the archive criteria."))
            return

        self.stdout.write(f"Matched {len(guests)} guest appointment(s) for archival.")
        for guest in guests:
            self.stdout.write(f"- #{guest.id} {guest.name} ({guest.status}) eta={guest.eta}")

        if dry_run:
            self.stdout.write(self.style.SUCCESS("Dry run complete. No guest appointments were archived."))
            return

        archived_count = 0
        for guest in guests:
            with transaction.atomic():
                current = GuestAppointment.objects.select_for_update().prefetch_related("scan_logs").get(pk=guest.pk)
                if current.archived_at:
                    self.stdout.write(self.style.WARNING(f"Skipping #{current.id}; already archived."))
                    continue
                archive_guest_appointment(current, archived_by=None)
                archived_count += 1

        self.stdout.write(self.style.SUCCESS(f"Archived {archived_count} guest appointment(s)."))
